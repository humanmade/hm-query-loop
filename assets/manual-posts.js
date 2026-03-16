const { addFilter } = wp.hooks;
const { createHigherOrderComponent } = wp.compose;
const { InspectorControls } = wp.blockEditor;
const { PanelBody, FormTokenField, ToggleControl } = wp.components;
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
		const isManual = query.manualSelect === true;

		const tokens = selected.map((p) => p.title);

		const [ suggestions, setSuggestions ] = useState([]);


		const onToggleManual = (value) => {
			if ( value ) {
				// Re-enable: manualPosts already stored in query (preserved from last session).
				// Derive include + perPage from them so the editor preview updates immediately.
				const restored = query.manualPosts || [];
				const ids = restored.map( (p) => p.id );

				// Rebuild _titleToId so onChange works with existing selections immediately.
				restored.forEach( (p) => { _titleToId[ p.title ] = p.id; } );

				setAttributes({
					query: {
						...query,
						manualSelect: true,
						_previousInherit: query.inherit,
						_previousPerPage: query.perPage,
						inherit: false,
						...( ids.length > 0 && {
							include: ids,
							perPage: ids.length,
						} )
					}
				});
			} else {
				// Disable: remove only the active-mode derived keys (include, perPage).
				// manualPosts is intentionally kept so it can be restored on re-enable.
				// eslint-disable-next-line no-unused-vars
				const { include: _inc, manualSelect: _ms, _previousInherit, perPage: _pp, per_page: _ppp, _previousPerPage, ...restQuery } = query;
				setAttributes({
					query: {
						...restQuery,
						inherit: _previousInherit !== undefined ? _previousInherit : restQuery.inherit || false,
						...( _previousPerPage !== undefined && { perPage: _previousPerPage } )
					}
				});
			}
		};


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
					}
				});
			} else {
				// eslint-disable-next-line no-unused-vars
				const { include: _inc, perPage: _pp, per_page: _ppp, ...restQuery } = query;
				setAttributes({
					query: {
						...restQuery,
						manualPosts: []
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
					{ title: "Manual Post Selection", initialOpen: false },
					wp.element.createElement(ToggleControl, {
						label: "Enable manual post selection",
						checked: isManual,
						onChange: onToggleManual
					}),
					isManual && wp.element.createElement(FormTokenField, {
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
