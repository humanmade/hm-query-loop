/**
 * Curated Posts control for the Query Loop block.
 *
 * Renders a post search + ordered selection list that writes to the core
 * `query.include` attribute. When non-empty, the list overrides whatever
 * post set the block would otherwise return (including a registered
 * `hmPreset`), and order is preserved via `query.orderBy = 'include'`.
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
 * Resolve a list of post IDs to lightweight {id, title, type} records via the
 * `core` data store. Scoped to the query's post type when known so we use the
 * right REST entity; falls back to the search endpoint for mixed/unknown types.
 *
 * @param {number[]} ids      Selected post IDs in display order.
 * @param {string}   postType Current query post type, or empty for any.
 * @return {{records: Array, isResolving: boolean}} Resolved post records and loading state.
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

			const records = getEntityRecords( 'postType', type, query ) || [];
			const resolving = isResolving( 'getEntityRecords', [
				'postType',
				type,
				query,
			] );

			return { records, isResolving: resolving };
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[ idsKey, postType ]
	);
}

/**
 * Search posts scoped to the current query's post type.
 *
 * Uses the post type's own REST collection endpoint (`/wp/v2/{rest_base}`)
 * rather than `/wp/v2/search`, since the latter only indexes post types that
 * explicitly opt in via a search handler — most custom post types do not.
 *
 * @param {string} term     Search term.
 * @param {string} postType Post type slug, or empty/`'any'` for any.
 * @return {{results: Array, isLoading: boolean, error: string|null}} Search results and request state.
 */
function usePostSearch( term, postType ) {
	const [ results, setResults ] = useState( [] );
	const [ isLoading, setIsLoading ] = useState( false );
	const [ error, setError ] = useState( null );
	const requestRef = useRef( 0 );

	// Resolve the post type's REST base so the search hits the right endpoint.
	const restBase = useSelect(
		( select ) => {
			const type = postType && postType !== 'any' ? postType : 'post';
			const postTypeObject = select( 'core' ).getPostType( type );
			return postTypeObject?.rest_base || type;
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

		const params = {
			search: term,
			per_page: SEARCH_RESULTS_PER_PAGE,
			_fields: 'id,title',
		};

		apiFetch( {
			path: addQueryArgs( `/wp/v2/${ restBase }`, params ),
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
 * Coerce the include attribute to a clean numeric array.
 *
 * @param {*} include Raw attribute value.
 * @return {number[]} Cleaned IDs.
 */
function normalizeIds( include ) {
	if ( ! Array.isArray( include ) ) {
		return [];
	}
	return include
		.map( ( id ) => parseInt( id, 10 ) )
		.filter( ( id ) => Number.isInteger( id ) && id > 0 );
}

/**
 * The control rendered inside the Query Loop block's inspector panel.
 *
 * @param {Object}   props
 * @param {Object}   props.query         Current `query` block attribute.
 * @param {Function} props.onChangeQuery Updates the `query` attribute.
 * @return {JSX.Element} The rendered control.
 */
export default function CuratedPostsControl( { query, onChangeQuery } ) {
	const include = useMemo(
		() => normalizeIds( query?.include ),
		[ query?.include ]
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

	const { records, isResolving } = useResolvedPosts( include, postType );
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

	const setInclude = ( nextIds ) => {
		const { include: _omit, orderBy: _omitOrder, ...rest } = query || {};
		if ( nextIds.length === 0 ) {
			onChangeQuery( rest );
			return;
		}
		onChangeQuery( {
			...rest,
			include: nextIds,
			orderBy: 'include',
		} );
	};

	const addPost = ( id ) => {
		if ( include.includes( id ) ) {
			return;
		}
		setInclude( [ ...include, id ] );
		setSearchTerm( '' );
		setDebouncedTerm( '' );
	};

	const removePost = ( id ) => {
		setInclude( include.filter( ( existing ) => existing !== id ) );
	};

	const movePost = ( id, direction ) => {
		const index = include.indexOf( id );
		if ( index === -1 ) {
			return;
		}
		const target = index + direction;
		if ( target < 0 || target >= include.length ) {
			return;
		}
		const next = [ ...include ];
		const [ moved ] = next.splice( index, 1 );
		next.splice( target, 0, moved );
		setInclude( next );
	};

	const clearAll = () => setInclude( [] );

	const filteredResults = results.filter(
		( result ) => ! include.includes( result.id )
	);

	return (
		<div className="hm-query-loop-curated">
			<BaseControl
				__nextHasNoMarginBottom
				id="hm-query-loop-curated-posts-help"
				help={ __(
					'Override the query with a hand-picked, ordered list of posts. Leave empty to use the query above.',
					'hm-query-loop'
				) }
			>
				{ include.length > 0 && (
					<ul className="hm-query-loop-curated-list">
						{ include.map( ( id, index ) => {
							const record = recordsById[ id ];
							const title =
								record?.title?.rendered ||
								record?.title ||
								( isResolving
									? __( 'Loading…', 'hm-query-loop' )
									: sprintf(
											/* translators: %d: post ID */
											__( 'Post #%d', 'hm-query-loop' ),
											id
									  ) );
							return (
								<li
									key={ id }
									className="hm-query-loop-curated-item"
								>
									<span
										className="hm-query-loop-curated-item__title"
										title={ title }
									>
										{ `${ index + 1 }. ` }
										<span
											// eslint-disable-next-line react/no-danger
											dangerouslySetInnerHTML={ {
												__html: title,
											} }
										/>
									</span>
									<span className="hm-query-loop-curated-item__actions">
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
												index === include.length - 1
											}
											onClick={ () => movePost( id, 1 ) }
										/>
										<Button
											size="small"
											icon="no-alt"
											label={ __(
												'Remove',
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
				label={ __( 'Add a post', 'hm-query-loop' ) }
				placeholder={ __( 'Type to search…', 'hm-query-loop' ) }
				value={ searchTerm }
				onChange={ setSearchTerm }
			/>

			{ isLoading && (
				<div className="hm-query-loop-curated-loading">
					<Spinner />
					<span>{ __( 'Searching…', 'hm-query-loop' ) }</span>
				</div>
			) }

			{ ! isLoading && error && (
				<p className="hm-query-loop-curated-error">{ error }</p>
			) }

			{ ! isLoading &&
				! error &&
				debouncedTerm.length >= 2 &&
				filteredResults.length === 0 && (
					<p className="hm-query-loop-curated-empty">
						{ __( 'No matching posts found.', 'hm-query-loop' ) }
					</p>
				) }

			{ ! isLoading && filteredResults.length > 0 && (
				<ul className="hm-query-loop-curated-results">
					{ filteredResults.map( ( result ) => (
						<li key={ result.id }>
							<Button
								variant="tertiary"
								size="small"
								onClick={ () => addPost( result.id ) }
								className="hm-query-loop-curated-result"
							>
								<span
									// eslint-disable-next-line react/no-danger
									dangerouslySetInnerHTML={ {
										__html:
											result.title?.rendered ||
											result.title ||
											sprintf(
												/* translators: %d: post ID */
												__(
													'Post #%d',
													'hm-query-loop'
												),
												result.id
											),
									} }
								/>
							</Button>
						</li>
					) ) }
				</ul>
			) }

			{ include.length > 0 && (
				<Button
					variant="link"
					isDestructive
					onClick={ clearAll }
					className="hm-query-loop-curated-clear"
				>
					{ __( 'Clear curated list', 'hm-query-loop' ) }
				</Button>
			) }
		</div>
	);
}
