/**
 * WordPress dependencies
 */
import { addFilter } from '@wordpress/hooks';
import { createHigherOrderComponent } from '@wordpress/compose';
import { useSelect } from '@wordpress/data';
import { InspectorControls } from '@wordpress/block-editor';
import { PanelBody, ToggleControl, TextControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { useEffect, createContext, useContext } from '@wordpress/element';

/**
 * Styles
 */
import './index.scss';

/**
 * Create a context for tracking used post IDs within a query loop in the editor.
 */
const UsedPostsContext = createContext({
	postTemplates: [],
});

/**
 * Add custom attributes and context to the Query Loop block.
 *
 * @param {Object} settings Block settings.
 * @param {string} name Block name.
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
			'hm-query-loop/settings': 'hmQueryLoop',
		},
	};
}

addFilter(
	'blocks.registerBlockType',
	'hm-query-loop/add-query-loop-attributes',
	addQueryLoopAttributes
);

/**
 * Add usesContext and attributes to core/post-template block.
 *
 * @param {object} settings Block settings.
 * @param {string} name     Block name.
 * @return {object} Modified block settings.
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
		usesContext: [
			...( settings.usesContext || [] ),
			'hm-query-loop/settings',
		],
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

		// Sync the perPage setting with the query perPage for non-inherited queries
		// For inherited queries, sync it as well to show the override in the editor
		useEffect( () => {
			if ( perPage !== undefined && perPage > 0 ) {
				// Try to update the query.perPage to reflect in the editor
				if ( query.perPage !== perPage ) {
					setAttributes( {
						query: {
							...query,
							perPage,
						},
					} );
				}
			}
		}, [ perPage ] );

		return (
			<>
				<BlockEdit { ...props } />
				<InspectorControls>
					<PanelBody
						title={ __( 'Extra Query Loop Settings', 'hm-query-loop' ) }
						initialOpen={ false }
					>
						{ isInheritQuery && (
							<TextControl
								label={ __(
									'Posts per page (Override)',
									'hm-query-loop'
								) }
								help={ __(
									'Override the number of posts to show when inheriting the query. Maximum value is limited to the site\'s posts per page setting.',
									'hm-query-loop'
								) }
								type="number"
								value={ perPage ?? '' }
								onChange={ ( value ) => {
									const numValue =
										value === '' ? undefined : parseInt( value, 10 );
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
const withPostTemplateInspectorControls = createHigherOrderComponent( ( BlockEdit ) => {
	return ( props ) => {
		const { name, attributes, setAttributes, context, clientId } = props;

		if ( name !== 'core/post-template' ) {
			return <BlockEdit { ...props } />;
		}

		const { hmQueryLoop = {} } = attributes;
		const { perPage } = hmQueryLoop;

		// Get query context
		const queryContext = context?.query || {};
		const isInheritQuery = queryContext.inherit || false;

		// Get the max per page from query block's perPage or site default
		const queryPerPage = context?.query?.perPage || window.hmQueryLoopSettings?.postsPerPage || 10;

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
							title={ __( 'Post Template Settings', 'hm-query-loop' ) }
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
										value === '' ? undefined : parseInt( value, 10 );
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
}, 'withPostTemplateInspectorControls' );

addFilter(
	'editor.BlockEdit',
	'hm-query-loop/with-post-template-inspector-controls',
	withPostTemplateInspectorControls
);

/**
 * Wrap Query Loop block with UsedPostsContext provider.
 */
const withQueryLoopContextProvider = createHigherOrderComponent( ( BlockEdit ) => {
	return ( props ) => {
		const { name, clientId } = props;

		if ( name !== 'core/query' ) {
			return <BlockEdit { ...props } />;
		}

		const postTemplates = useSelect( select => {
			const { getBlock, getBlocksByName, getBlockParentsByBlockName } = select( 'core/block-editor' );
			const postTemplateClientIds = getBlocksByName( 'core/post-template' );
			const childPostTemplatesClientIds = postTemplateClientIds.filter( postTemplateClientId => {
				const parentQueryClientIds = getBlockParentsByBlockName( postTemplateClientId, 'core/query' );
				return parentQueryClientIds.indexOf( clientId ) > -1;
			} );
			return childPostTemplatesClientIds.map( getBlock );
		}, [ clientId ] );

		return (
			<UsedPostsContext.Provider value={ { postTemplates } }>
				<BlockEdit { ...props } />
			</UsedPostsContext.Provider>
		);
	};
}, 'withQueryLoopContextProvider' );

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
		const hmQueryLoopSettings = context?.[ 'hm-query-loop/settings' ] || {};
		const queryLevelPerPage = hmQueryLoopSettings.perPage;

		// Get the hmPostTemplate settings from attributes (post-template block level)
		const hmQueryLoop = attributes?.hmQueryLoop || {};
		const postTemplateLevelPerPage = hmQueryLoop.perPage;

		// Determine which perPage to use
		// Priority: post-template level > query level
		let perPage = postTemplateLevelPerPage || queryLevelPerPage;

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
		const hideBeforeOffset = offset > 0 ? `
			${ blockSelector } :is(.wp-block-post:not([style*="display: none"])):nth-of-type(-n+${ offset }) {
				display: none !important;
			}
		` : '';

		const hideAfterLimit = `
			${ blockSelector } :is(.wp-block-post:not([style*="display: none"])):nth-of-type(n+${ offset + perPage + 2 }) {
				display: none !important;
			}
		`;

		// When a subsequent post-template is shown with a positive offset, the initial dropzone placeholder
		// and hidden preview block cause the CSS hiding to be off by one. Each post template actually contains
		// posts per page + 1 hidden preview instance of .wp-block-post. The currently selected preview becomes
		// hidden and the dropzone/editable post instance created just before it.
		const hideFirstInitial = offset > 0 ? `
			${ blockSelector }:has(.wp-block-post[data-is-drop-zone]:first-child) :is(.wp-block-post:not([style*="display: none"])):nth-of-type(-n+${ offset + 1 }) {
				display: none !important;
			}
		` : '';

		const inlineStyle = hideBeforeOffset + hideAfterLimit + hideFirstInitial;

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
 * Add custom attributes to the block's save output.
 *
 * @param {Object} extraProps Extra props.
 * @param {Object} blockType Block type.
 * @param {Object} attributes Block attributes.
 * @return {Object} Modified extra props.
 */
function addSaveProps( extraProps, blockType, attributes ) {
	if ( blockType.name !== 'core/query' ) {
		return extraProps;
	}

	return extraProps;
}

addFilter(
	'blocks.getSaveContent.extraProps',
	'hm-query-loop/add-save-props',
	addSaveProps
);
