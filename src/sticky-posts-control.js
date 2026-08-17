/**
 * Sticky Posts control for the Query Loop block.
 *
 * Renders a post search plus an ordered selection list that writes to the
 * `hmQueryLoop.stickyPosts` attribute. Selected posts are pinned to the front
 * of the loop, in the order shown here; everything else keeps the ordering the
 * block's own settings produce.
 *
 * This pins rather than filters: a post that the query would not return anyway
 * is not pulled in by pinning it. That keeps "which posts appear" the job of
 * the query settings, and "what order they appear in" the job of this control.
 *
 * The search and resolution hooks here follow the same approach as the
 * Curated Posts control proposed in #15.
 */

import apiFetch from '@wordpress/api-fetch';
import { useSelect } from '@wordpress/data';
import {
	Button,
	BaseControl,
	TextControl,
	Spinner,
} from '@wordpress/components';
import { useEffect, useMemo, useState, useRef } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { addQueryArgs } from '@wordpress/url';

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_RESULTS_PER_PAGE = 10;

/**
 * Coerce a stored sticky list to a clean array of post IDs.
 *
 * @param {*} value Raw attribute value.
 * @return {number[]} Cleaned IDs, in order.
 */
function normalizeIds( value ) {
	if ( ! Array.isArray( value ) ) {
		return [];
	}
	return value
		.map( ( id ) => parseInt( id, 10 ) )
		.filter( ( id ) => Number.isInteger( id ) && id > 0 );
}

/**
 * Resolve post IDs to lightweight {id, title} records via the `core` store.
 *
 * Scoped to the query's post type so the right REST entity is used.
 *
 * @param {number[]} ids      Selected post IDs in display order.
 * @param {string}   postType Current query post type.
 * @return {{records: Array, isResolving: boolean}} Resolved records and loading state.
 */
function useResolvedPosts( ids, postType ) {
	const idsKey = ids.join( ',' );
	return useSelect(
		( select ) => {
			if ( ! ids || ids.length === 0 ) {
				return { records: [], isResolving: false };
			}

			const { getEntityRecords, isResolving } = select( 'core' );
			const type = postType && postType !== 'any' ? postType : 'post';

			const query = {
				include: ids,
				per_page: ids.length,
				orderby: 'include',
				_fields: 'id,title,type',
				context: 'view',
			};

			return {
				records: getEntityRecords( 'postType', type, query ) || [],
				isResolving: isResolving( 'getEntityRecords', [
					'postType',
					type,
					query,
				] ),
			};
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[ idsKey, postType ]
	);
}

/**
 * Search posts scoped to the current query's post type.
 *
 * Uses the post type's own REST collection endpoint rather than
 * `/wp/v2/search`, since the latter only indexes post types that opt in via a
 * search handler — most custom post types do not.
 *
 * @param {string} term     Search term.
 * @param {string} postType Post type slug.
 * @return {{results: Array, isLoading: boolean, error: string|null}} Search state.
 */
function usePostSearch( term, postType ) {
	const [ results, setResults ] = useState( [] );
	const [ isLoading, setIsLoading ] = useState( false );
	const [ error, setError ] = useState( null );
	const requestRef = useRef( 0 );

	const restBase = useSelect(
		( select ) => {
			const type = postType && postType !== 'any' ? postType : 'post';
			return select( 'core' ).getPostType( type )?.rest_base || type;
		},
		[ postType ]
	);

	useEffect( () => {
		if ( ! term || term.length < 2 ) {
			setResults( [] );
			setIsLoading( false );
			setError( null );
			return;
		}

		const requestId = ++requestRef.current;
		setIsLoading( true );
		setError( null );

		apiFetch( {
			path: addQueryArgs( `/wp/v2/${ restBase }`, {
				search: term,
				per_page: SEARCH_RESULTS_PER_PAGE,
				_fields: 'id,title',
			} ),
		} )
			.then( ( data ) => {
				if ( requestId !== requestRef.current ) {
					return;
				}
				setResults( Array.isArray( data ) ? data : [] );
				setIsLoading( false );
			} )
			.catch( ( err ) => {
				if ( requestId !== requestRef.current ) {
					return;
				}
				setError(
					err?.message || __( 'Search failed.', 'hm-query-loop' )
				);
				setIsLoading( false );
			} );
	}, [ term, restBase ] );

	return { results, isLoading, error };
}

/**
 * Resolve a post's display title, falling back while it is still loading.
 *
 * @param {Object}  record      Resolved post record, if any.
 * @param {number}  id          Post ID.
 * @param {boolean} isResolving Whether the record is still being fetched.
 * @return {string} Title markup string.
 */
function getTitle( record, id, isResolving ) {
	return (
		record?.title?.rendered ||
		record?.title ||
		( isResolving
			? __( 'Loading…', 'hm-query-loop' )
			: sprintf(
					/* translators: %d: post ID */
					__( 'Post #%d', 'hm-query-loop' ),
					id
			  ) )
	);
}

/**
 * The control rendered inside the Query Loop block's inspector panel.
 *
 * @param {Object}   props
 * @param {Object}   props.query       Current `query` block attribute.
 * @param {number[]} props.stickyPosts Currently pinned post IDs, in order.
 * @param {Function} props.onChange    Receives the next pinned ID array.
 * @return {Element} The rendered control.
 */
export default function StickyPostsControl( { query, stickyPosts, onChange } ) {
	const sticky = useMemo(
		() => normalizeIds( stickyPosts ),
		[ stickyPosts ]
	);
	const postType = query?.postType || 'post';

	const [ searchTerm, setSearchTerm ] = useState( '' );
	const [ debouncedTerm, setDebouncedTerm ] = useState( '' );

	useEffect( () => {
		const id = setTimeout(
			() => setDebouncedTerm( searchTerm ),
			SEARCH_DEBOUNCE_MS
		);
		return () => clearTimeout( id );
	}, [ searchTerm ] );

	const { records, isResolving } = useResolvedPosts( sticky, postType );
	const { results, isLoading, error } = usePostSearch(
		debouncedTerm,
		postType
	);

	const recordsById = useMemo( () => {
		const map = {};
		for ( const record of records ) {
			map[ record.id ] = record;
		}
		return map;
	}, [ records ] );

	const addPost = ( id ) => {
		if ( sticky.includes( id ) ) {
			return;
		}
		onChange( [ ...sticky, id ] );
		setSearchTerm( '' );
		setDebouncedTerm( '' );
	};

	const removePost = ( id ) => {
		onChange( sticky.filter( ( existing ) => existing !== id ) );
	};

	const movePost = ( id, direction ) => {
		const index = sticky.indexOf( id );
		const target = index + direction;
		if ( index === -1 || target < 0 || target >= sticky.length ) {
			return;
		}
		const next = [ ...sticky ];
		const [ moved ] = next.splice( index, 1 );
		next.splice( target, 0, moved );
		onChange( next );
	};

	const filteredResults = results.filter(
		( result ) => ! sticky.includes( result.id )
	);

	return (
		<div className="hm-query-loop-sticky">
			<BaseControl
				__nextHasNoMarginBottom
				id="hm-query-loop-sticky-posts-help"
				help={ __(
					'Pin posts to the start of this loop. They keep the order shown here; everything else follows the ordering above. Pinning does not add a post the query would not otherwise return.',
					'hm-query-loop'
				) }
			>
				{ sticky.length > 0 && (
					<ul className="hm-query-loop-sticky-list">
						{ sticky.map( ( id, index ) => {
							const title = getTitle(
								recordsById[ id ],
								id,
								isResolving
							);
							return (
								<li
									key={ id }
									className="hm-query-loop-sticky-item"
								>
									<span
										className="hm-query-loop-sticky-item__title"
										title={ title }
									>
										{ `${ index + 1 }. ` }
										<span
											dangerouslySetInnerHTML={ {
												__html: title,
											} }
										/>
									</span>
									<span className="hm-query-loop-sticky-item__actions">
										<Button
											size="small"
											icon="arrow-up-alt2"
											label={ __(
												'Move up',
												'hm-query-loop'
											) }
											disabled={ index === 0 }
											onClick={ () => movePost( id, -1 ) }
										/>
										<Button
											size="small"
											icon="arrow-down-alt2"
											label={ __(
												'Move down',
												'hm-query-loop'
											) }
											disabled={
												index === sticky.length - 1
											}
											onClick={ () => movePost( id, 1 ) }
										/>
										<Button
											size="small"
											icon="no-alt"
											label={ __(
												'Unpin',
												'hm-query-loop'
											) }
											onClick={ () => removePost( id ) }
										/>
									</span>
								</li>
							);
						} ) }
					</ul>
				) }
			</BaseControl>

			<TextControl
				__nextHasNoMarginBottom
				__next40pxDefaultSize
				label={ __( 'Pin a post', 'hm-query-loop' ) }
				placeholder={ __( 'Type to search…', 'hm-query-loop' ) }
				value={ searchTerm }
				onChange={ setSearchTerm }
			/>

			{ isLoading && (
				<div className="hm-query-loop-sticky-loading">
					<Spinner />
					<span>{ __( 'Searching…', 'hm-query-loop' ) }</span>
				</div>
			) }

			{ ! isLoading && error && (
				<p className="hm-query-loop-sticky-error">{ error }</p>
			) }

			{ ! isLoading &&
				! error &&
				debouncedTerm.length >= 2 &&
				filteredResults.length === 0 && (
					<p className="hm-query-loop-sticky-empty">
						{ __( 'No matching posts found.', 'hm-query-loop' ) }
					</p>
				) }

			{ ! isLoading && filteredResults.length > 0 && (
				<ul className="hm-query-loop-sticky-results">
					{ filteredResults.map( ( result ) => (
						<li key={ result.id }>
							<Button
								variant="tertiary"
								size="small"
								onClick={ () => addPost( result.id ) }
								className="hm-query-loop-sticky-result"
							>
								<span
									dangerouslySetInnerHTML={ {
										__html: getTitle(
											result,
											result.id,
											false
										),
									} }
								/>
							</Button>
						</li>
					) ) }
				</ul>
			) }

			{ sticky.length > 0 && (
				<Button
					variant="link"
					isDestructive
					onClick={ () => onChange( [] ) }
					className="hm-query-loop-sticky-clear"
				>
					{ __( 'Unpin all', 'hm-query-loop' ) }
				</Button>
			) }
		</div>
	);
}
