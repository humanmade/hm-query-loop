const { addFilter } = wp.hooks;
const { createHigherOrderComponent } = wp.compose;
const { InspectorControls } = wp.blockEditor;
const { PanelBody, FormTokenField } = wp.components;
const { Fragment, useState } = wp.element;
const apiFetch = wp.apiFetch;


/**
 * Extend Query Loop attributes
 */
function addAttributes(settings, name) {

	if (name !== "core/query") {
		return settings;
	}

	settings.attributes = {
		...settings.attributes,
		query: {
			type: "object",
			default: {}
		}
	};

	return settings;
}

addFilter(
	"blocks.registerBlockType",
	"manual-query-loop/add-attributes",
	addAttributes
);


/**
 * Inspector UI
 */
const withInspectorControls = createHigherOrderComponent((BlockEdit) => {

	return (props) => {

		if (props.name !== "core/query") {
			return wp.element.createElement(BlockEdit, props);
		}

		const { attributes, setAttributes } = props;

		const query = attributes.query || {};
		const selected = query.manualPosts || [];

		const tokens = selected.map((p) => p.title);

		const [ suggestions, setSuggestions ] = useState([]);
		const [ map, setMap ] = useState({});


		const searchPosts = (value) => {

			if (!value || value.length < 2) return;

			apiFetch({
				path: "/wp/v2/search?search=" + encodeURIComponent(value) + "&type=post"
			}).then((results) => {

				const titles = [];
				const newMap = {};

				results.forEach((r) => {
					titles.push(r.title);
					newMap[r.title] = r.id;
				});

				setSuggestions(titles);
				setMap(newMap);

			});

		};


		const onChange = (newTokens) => {

			const posts = newTokens.map((title) => {

				const existing = selected.find((p) => p.title === title);
				if (existing) return existing;

				return {
					id: map[title],
					title: title
				};

			}).filter((p) => p && p.id);

			setAttributes({
				query: {
					...query,
					manualPosts: posts,
					perPage: posts.length,
					per_page: posts.length,
					offset: 0,
					inherit: false
				}
			});

		};


		return wp.element.createElement(
			Fragment,
			{},
			wp.element.createElement(BlockEdit, props),
			wp.element.createElement(
				InspectorControls,
				{},
				wp.element.createElement(
					PanelBody,
					{ title: "Manual Post Selection", initialOpen: true },
					wp.element.createElement(FormTokenField, {
						label: "Search and select posts",
						value: tokens,
						suggestions: suggestions,
						onInputChange: searchPosts,
						onChange: onChange
					})
				)
			)
		);

	};

}, "withInspectorControls");


addFilter(
	"editor.BlockEdit",
	"manual-query-loop/add-inspector",
	withInspectorControls
);
