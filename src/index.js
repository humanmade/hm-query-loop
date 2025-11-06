/**
 * WordPress dependencies
 */
import { addFilter } from '@wordpress/hooks';
import { createHigherOrderComponent } from '@wordpress/compose';
import { InspectorControls } from '@wordpress/block-editor';
import { PanelBody, ToggleControl, TextControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

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
		const { name, attributes, setAttributes } = props;

		if ( name !== 'core/query' ) {
			return <BlockEdit { ...props } />;
		}

		const { hmQueryLoop = {}, query = {} } = attributes;
		const { perPage, hideOnPaged, excludeDisplayed } = hmQueryLoop;

		const isInheritQuery = query.inherit || false;

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
									'Override the number of posts to show when inheriting the query. Leave empty to use the default.',
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
