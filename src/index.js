/**
 * WordPress dependencies
 */
import { addFilter } from '@wordpress/hooks';
import { createHigherOrderComponent } from '@wordpress/compose';
import { InspectorControls, useBlockEditContext, useBlockProps } from '@wordpress/block-editor';
import { PanelBody, ToggleControl, TextControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { useEffect } from '@wordpress/element';

/**
 * Styles
 */
import './index.scss';

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
 * Add usesContext to core/post-template block.
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
		const { name, attributes, setAttributes, clientId } = props;

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
 * Add CSS to hide excess posts in the editor when perPage override is set.
 */
const withPostTemplateStyles = createHigherOrderComponent( ( BlockEdit ) => {
	return ( props ) => {
		const { name, context, clientId } = props;

		// Only apply to post-template blocks
		if ( name !== 'core/post-template' ) {
			return <BlockEdit { ...props } />;
		}

		// Get the hmQueryLoop settings from context
		const hmQueryLoopSettings = context?.[ 'hm-query-loop/settings' ] || {};
		const { perPage } = hmQueryLoopSettings;

		// If perPage is set, add custom styling to limit visible posts
		if ( perPage && perPage > 0 ) {
			// Generate a unique selector for this block instance
			const blockSelector = `[data-block="${ clientId }"]`;

			// Create inline style to hide posts after the perPage limit
			const inlineStyle = `
				${ blockSelector } .wp-block-post:nth-child(n+${ perPage + 2 }) {
					display: none !important;
				}
			`;

			return (
				<>
					<style>{ inlineStyle }</style>
					<BlockEdit { ...props } />
				</>
			);
		}

		return <BlockEdit { ...props } />;
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
