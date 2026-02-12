/**
 * WordPress dependencies
 */
import { addFilter } from '@wordpress/hooks';
import { createHigherOrderComponent } from '@wordpress/compose';
import { useSelect } from '@wordpress/data';
import { InspectorControls } from '@wordpress/block-editor';
import {
	Disabled,
	PanelBody,
	ToggleControl,
	TextControl,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import {
	createContext,
	useContext,
	useEffect,
	useMemo,
} from '@wordpress/element';
import ServerSideRender from '@wordpress/server-side-render';
import { serialize } from '@wordpress/blocks';

/**
 * Styles
 */
import './index.scss';

/**
 * Create a context for tracking used post IDs within a query loop in the editor.
 */
const UsedPostsContext = createContext( {
	postTemplates: [],
} );

/**
 * Add custom attributes and context to the Query Loop block.
 *
 * @param {Object} settings Block settings.
 * @param {string} name     Block name.
 * @return {Object} Modified block settings.
 */
function addQueryLoopAttributes( settings, name ) {
	if ( name !== 'core/query' ) {
		return settings;
	}

	return {
		...settings,
		attributes: {
			...settings.attributes,
			hmQueryLoop: {
				type: 'object',
				default: {},
			},
		},
		providesContext: {
			...( settings.providesContext || {} ),
			hmQueryLoop: 'hmQueryLoop',
		},
	};
}

addFilter(
	'blocks.registerBlockType',
	'hm-query-loop/add-query-loop-attributes',
	addQueryLoopAttributes
);

/**
 * Ensure each Query Loop block has a unique queryId attribute.
 *
 * WordPress core does not deduplicate queryId when blocks are duplicated.
 * This HOC generates a unique queryId from the current post ID and the
 * block's index among all query blocks on the page.
 */
const withUniqueQueryId = createHigherOrderComponent( ( BlockEdit ) => {
	return ( props ) => {
		const { name, attributes, setAttributes, clientId } = props;

		if ( name !== 'core/query' ) {
			return <BlockEdit { ...props } />;
		}

		const expectedQueryId = useSelect(
			( select ) => {
				let postId = 0;
				try {
					postId = select( 'core/editor' )?.getCurrentPostId?.() || 0;
				} catch {
					postId = 0;
				}
				const allQueryBlocks =
					select( 'core/block-editor' ).getBlocksByName(
						'core/query'
					);
				const index = allQueryBlocks.indexOf( clientId );
				return postId * 1000 + index + 1;
			},
			[ clientId ]
		);

		useEffect( () => {
			if ( attributes.queryId !== expectedQueryId ) {
				setAttributes( { queryId: expectedQueryId } );
			}
		}, [ expectedQueryId, attributes.queryId, setAttributes ] );

		return <BlockEdit { ...props } />;
	};
}, 'withUniqueQueryId' );

addFilter(
	'editor.BlockEdit',
	'hm-query-loop/with-unique-query-id',
	withUniqueQueryId
);

/**
 * Add usesContext and attributes to core/post-template block.
 *
 * @param {Object} settings Block settings.
 * @param {string} name     Block name.
 * @return {Object} Modified block settings.
 */
function addPostTemplateContext( settings, name ) {
	if ( name !== 'core/post-template' ) {
		return settings;
	}

	return {
		...settings,
		attributes: {
			...settings.attributes,
			hmQueryLoop: {
				type: 'object',
				default: {},
			},
		},
		usesContext: [ ...( settings.usesContext || [] ), 'hmQueryLoop' ],
	};
}

addFilter(
	'blocks.registerBlockType',
	'hm-query-loop/add-post-template-context',
	addPostTemplateContext
);

/**
 * Add custom controls to the Query Loop block inspector.
 */
const withInspectorControls = createHigherOrderComponent( ( BlockEdit ) => {
	return ( props ) => {
		const { name, attributes, setAttributes } = props;

		if ( name !== 'core/query' ) {
			return <BlockEdit { ...props } />;
		}

		const { hmQueryLoop = {}, query = {} } = attributes;
		const { perPage, hideOnPaged, excludeDisplayed } = hmQueryLoop;

		const isInheritQuery = query.inherit || false;
		const maxPerPage = window.hmQueryLoopSettings?.postsPerPage || 10;

		return (
			<>
				<BlockEdit { ...props } />
				<InspectorControls>
					<PanelBody
						title={ __(
							'Extra Query Loop Settings',
							'hm-query-loop'
						) }
						initialOpen={ false }
					>
						{ isInheritQuery && (
							<TextControl
								label={ __(
									'Posts per page (Override)',
									'hm-query-loop'
								) }
								help={ __(
									"Override the number of posts to show when inheriting the query. Maximum value is limited to the site's posts per page setting.",
									'hm-query-loop'
								) }
								type="number"
								value={ perPage ?? '' }
								onChange={ ( value ) => {
									const numValue =
										value === ''
											? undefined
											: parseInt( value, 10 );
									setAttributes( {
										hmQueryLoop: {
											...hmQueryLoop,
											perPage: numValue,
										},
									} );
								} }
								min={ 1 }
								max={ maxPerPage }
							/>
						) }
						{ ! isInheritQuery && perPage && (
							<p style={ { fontSize: '12px', color: '#757575' } }>
								{ __(
									'Posts per page override is only available when inheriting the query.',
									'hm-query-loop'
								) }
							</p>
						) }
						<ToggleControl
							label={ __(
								'Hide on paginated pages',
								'hm-query-loop'
							) }
							help={ __(
								'Hide this query loop when viewing page 2 or higher.',
								'hm-query-loop'
							) }
							checked={ hideOnPaged }
							onChange={ ( value ) =>
								setAttributes( {
									hmQueryLoop: {
										...hmQueryLoop,
										hideOnPaged: value,
									},
								} )
							}
						/>
						<ToggleControl
							label={ __(
								'Exclude already displayed posts',
								'hm-query-loop'
							) }
							help={ __(
								'Exclude posts that have been displayed by previous query loops on this page.',
								'hm-query-loop'
							) }
							checked={ excludeDisplayed }
							onChange={ ( value ) =>
								setAttributes( {
									hmQueryLoop: {
										...hmQueryLoop,
										excludeDisplayed: value,
									},
								} )
							}
						/>
					</PanelBody>
				</InspectorControls>
			</>
		);
	};
}, 'withInspectorControls' );

addFilter(
	'editor.BlockEdit',
	'hm-query-loop/with-inspector-controls',
	withInspectorControls
);

/**
 * Add custom controls to the Post Template block inspector.
 */
const withPostTemplateInspectorControls = createHigherOrderComponent(
	( BlockEdit ) => {
		return ( props ) => {
			const { name, attributes, setAttributes, context, clientId } =
				props;

			if ( name !== 'core/post-template' ) {
				return <BlockEdit { ...props } />;
			}

			const { hmQueryLoop = {} } = attributes;
			const { perPage } = hmQueryLoop;

			// Get query context
			const queryContext = context?.query || {};
			const isInheritQuery = queryContext.inherit || false;

			// Get the max per page from query block's perPage or site default
			const queryPerPage =
				context?.query?.perPage ||
				window.hmQueryLoopSettings?.postsPerPage ||
				10;

			// Get the list of child post templates for the current query loop
			const { postTemplates } = useContext( UsedPostsContext );

			// Calculate the total posts used by preceding post templates
			let usedPosts = 0;
			for ( const postTemplate of postTemplates ) {
				if ( postTemplate.clientId === clientId ) {
					// Stop when we reach the current post template
					break;
				}
				usedPosts += postTemplate.attributes?.hmQueryLoop?.perPage || 0;
			}

			// Calculate remaining posts available for this post template
			const remainingPosts = Math.max( 1, queryPerPage - usedPosts );

			return (
				<>
					<BlockEdit { ...props } />
					{ ! isInheritQuery && (
						<InspectorControls>
							<PanelBody
								title={ __(
									'Post Template Settings',
									'hm-query-loop'
								) }
								initialOpen={ false }
							>
								<TextControl
									label={ __(
										'Posts per template',
										'hm-query-loop'
									) }
									help={ __(
										'Set the number of posts to show in this post template block. Leave empty to show all remaining posts.',
										'hm-query-loop'
									) }
									type="number"
									value={ perPage ?? '' }
									onChange={ ( value ) => {
										const numValue =
											value === ''
												? undefined
												: parseInt( value, 10 );
										setAttributes( {
											hmQueryLoop: {
												...hmQueryLoop,
												perPage: numValue,
											},
										} );
									} }
									min={ 1 }
									max={ remainingPosts }
								/>
							</PanelBody>
						</InspectorControls>
					) }
				</>
			);
		};
	},
	'withPostTemplateInspectorControls'
);

addFilter(
	'editor.BlockEdit',
	'hm-query-loop/with-post-template-inspector-controls',
	withPostTemplateInspectorControls
);

/**
 * Wrap Query Loop block with UsedPostsContext provider.
 */
const withQueryLoopContextProvider = createHigherOrderComponent(
	( BlockEdit ) => {
		return ( props ) => {
			const { name, clientId } = props;

			if ( name !== 'core/query' ) {
				return <BlockEdit { ...props } />;
			}

			const postTemplates = useSelect(
				( select ) => {
					const {
						getBlock,
						getBlocksByName,
						getBlockParentsByBlockName,
					} = select( 'core/block-editor' );
					const postTemplateClientIds =
						getBlocksByName( 'core/post-template' );
					const childPostTemplatesClientIds =
						postTemplateClientIds.filter(
							( postTemplateClientId ) => {
								const parentQueryClientIds =
									getBlockParentsByBlockName(
										postTemplateClientId,
										'core/query'
									);
								return (
									parentQueryClientIds.indexOf( clientId ) >
									-1
								);
							}
						);
					return childPostTemplatesClientIds.map( getBlock );
				},
				[ clientId ]
			);

			return (
				<UsedPostsContext.Provider value={ { postTemplates } }>
					<BlockEdit { ...props } />
				</UsedPostsContext.Provider>
			);
		};
	},
	'withQueryLoopContextProvider'
);

addFilter(
	'editor.BlockEdit',
	'hm-query-loop/with-query-loop-context-provider',
	withQueryLoopContextProvider
);

/**
 * Add CSS to hide excess posts in the editor when perPage override is set.
 */
const withPostTemplateStyles = createHigherOrderComponent( ( BlockEdit ) => {
	return ( props ) => {
		const { name, context, clientId, attributes } = props;

		// Only apply to post-template blocks
		if ( name !== 'core/post-template' ) {
			return <BlockEdit { ...props } />;
		}

		// Get the hmQueryLoop settings from context (query block level)
		const hmQueryLoopSettings = context?.hmQueryLoop || {};
		const queryLevelPerPage = hmQueryLoopSettings.perPage;

		// Get the hmPostTemplate settings from attributes (post-template block level)
		const hmQueryLoop = attributes?.hmQueryLoop || {};
		const postTemplateLevelPerPage = hmQueryLoop.perPage;

		// Determine which perPage to use
		// Priority: post-template level > query level
		const perPage = postTemplateLevelPerPage || queryLevelPerPage;

		// Get the list of child post templates for the current query loop.
		const { postTemplates } = useContext( UsedPostsContext );

		// Calculate the offset based on other postTemplates per page setting.
		let offset = 0;

		for ( const postTemplate of postTemplates ) {
			if ( postTemplate.clientId !== clientId ) {
				offset += postTemplate.attributes?.hmQueryLoop?.perPage || 0;
			} else {
				break;
			}
		}

		// Generate a unique selector for this block instance
		const blockSelector = `[data-block="${ clientId }"]`;

		// Create inline style to hide posts before offset and after perPage limit
		const hideBeforeOffset =
			offset > 0
				? `
			${ blockSelector } :is(.wp-block-post:not([style*="display: none"])):nth-of-type(-n+${ offset }) {
				display: none !important;
			}
		`
				: '';

		const hideAfterLimit = `
			${ blockSelector } :is(.wp-block-post:not([style*="display: none"])):nth-of-type(n+${
				offset + perPage + 2
			}) {
				display: none !important;
			}
		`;

		// When a subsequent post-template is shown with a positive offset, the initial dropzone placeholder
		// and hidden preview block cause the CSS hiding to be off by one. Each post template actually contains
		// posts per page + 1 hidden preview instance of .wp-block-post. The currently selected preview becomes
		// hidden and the dropzone/editable post instance created just before it.
		const hideFirstInitial =
			offset > 0
				? `
			${ blockSelector }:has(.wp-block-post[data-is-drop-zone]:first-child) :is(.wp-block-post:not([style*="display: none"])):nth-of-type(-n+${
				offset + 1
			}) {
				display: none !important;
			}
		`
				: '';

		const inlineStyle =
			hideBeforeOffset + hideAfterLimit + hideFirstInitial;

		return (
			<>
				<style>{ inlineStyle }</style>
				<BlockEdit { ...props } />
			</>
		);
	};
}, 'withPostTemplateStyles' );

addFilter(
	'editor.BlockEdit',
	'hm-query-loop/with-post-template-styles',
	withPostTemplateStyles
);

/**
 * Replace the Query Loop block content with a server-side rendered preview
 * when the block is not selected. This avoids the many API requests that
 * inner blocks make to load content, which is costly on pages with lots of
 * query loops. When the user clicks on the block it switches to the full
 * editor.
 */
const withSSRPreview = createHigherOrderComponent( ( BlockEdit ) => {
	return ( props ) => {
		const { name, clientId } = props;

		if ( name !== 'core/query' ) {
			return <BlockEdit { ...props } />;
		}

		const isSelected = useSelect(
			( select ) => {
				const { isBlockSelected, hasSelectedInnerBlock } =
					select( 'core/block-editor' );
				return (
					isBlockSelected( clientId ) ||
					hasSelectedInnerBlock( clientId, true )
				);
			},
			[ clientId ]
		);

		const block = useSelect(
			( select ) => {
				return select( 'core/block-editor' ).getBlock( clientId );
			},
			[ clientId ]
		);

		const postId = useSelect( ( select ) => {
			try {
				return select( 'core/editor' )?.getCurrentPostId?.() || 0;
			} catch {
				return 0;
			}
		}, [] );

		const serializedContent = useMemo( () => {
			if ( ! block ) {
				return '';
			}
			return serialize( [ block ] );
		}, [ block ] );

		if ( isSelected ) {
			return <BlockEdit { ...props } />;
		}

		return (
			<Disabled>
				<ServerSideRender
					block="hm-query-loop/preview"
					attributes={ { content: serializedContent } }
					httpMethod="POST"
					urlQueryArgs={ { post_id: postId } }
				/>
			</Disabled>
		);
	};
}, 'withSSRPreview' );

addFilter(
	'editor.BlockEdit',
	'hm-query-loop/with-ssr-preview',
	withSSRPreview
);
