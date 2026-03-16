const { addFilter } = wp.hooks;
const { createHigherOrderComponent } = wp.compose;
const { InspectorControls } = wp.blockEditor;
const { PanelBody, FormTokenField } = wp.components;
const { Fragment, useState } = wp.element;
const apiFetch = wp.apiFetch;

// Module-level map avoids stale closure bugs with useState in onChange callbacks.
const _titleToId = {};


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


		const searchPosts = (value) => {

			if (!value || value.length < 2) return;

			apiFetch({
				path: "/wp/v2/search?search=" + encodeURIComponent(value) + "&type=post"
			}).then((results) => {

				const titles = [];

				results.forEach((r) => {
					titles.push(r.title);
					_titleToId[r.title] = r.id;
				});

				setSuggestions(titles);

			});

		};


		const onChange = (newTokens) => {

			const posts = newTokens.map((title) => {

				const existing = selected.find((p) => p.title === title);
				if (existing) return existing;

				return {
					id: _titleToId[title],
					title: title
				};

			}).filter((p) => p && p.id);

			const ids = posts.map((p) => p.id);

			// When posts are selected: force include + disable inherit so the
			// editor preview updates live. When cleared: restore normal behavior.
			if ( ids.length > 0 ) {
				setAttributes({
					query: {
						...query,
						manualPosts: posts,
						include: ids,
						perPage: ids.length,
						per_page: ids.length,
						offset: 0,
						inherit: false
					}
				});
			} else {
				setAttributes({
					query: {
						...query,
						manualPosts: [],
						include: undefined,
						perPage: query.perPage,
						per_page: query.per_page,
						offset: query.offset
					}
				});
			}

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
