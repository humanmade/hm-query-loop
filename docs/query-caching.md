# Query caching

Notes on how Query Loop blocks interact with WordPress's object cache, why post
exclusion is expensive, and what this plugin does about it.

## The problem

`WP_Query` caches the ID list for a query in the `post-queries` object cache
group. The cache key is:

```php
$key = md5( serialize( $args ) . $sql );
```

— that is, **the query vars and the generated SQL**. Two loops that ask the same
question share one entry; two loops whose SQL differs by a single character do
not.

Exclusion is applied by putting IDs into `post__not_in`, which puts them into the
SQL:

```sql
AND wp_posts.ID NOT IN (1234)
```

For a "related posts" or "more from this author" loop that excludes the post
being viewed, `1234` is different on every URL. A site with 50,000 posts ends up
with 50,000 cache entries for what is really one question — "the latest N posts"
— and every one of them is cold the first time it is asked. The entries are also
invalidated together (see [Invalidation](#invalidation)), so they rarely get a
second chance to be useful.

The same thing happens, less dramatically, when a second loop on a page excludes
what the first one displayed: its key depends on the exact contents of every loop
above it.

## The fix

Ask the cacheable question, and do the excluding afterwards:

> To show 5 posts excluding the current one, fetch 6 posts with no exclusion at
> all, drop the current post in PHP, and render the first 5.

The query — and therefore the cache key — is now identical on every URL. One
entry serves the whole site. The cost is one extra row fetched and a `foreach`
over six items.

This is only worth doing because of where the object cache write happens.

### Where the cache write happens

In `WP_Query::get_posts()` the order is:

1. cache lookup (`wp_cache_get_salted( $cache_key, 'post-queries', … )`)
2. the database query
3. **the cache write** — `array( 'posts' => $post_ids, 'found_posts' => …, 'max_num_pages' => … )`
4. `posts_results`
5. sticky post handling
6. **`the_posts`**
7. `post_count` recomputed, posts re-mapped through `get_post()`, post caches primed

In WordPress 6.9 the write is around line 3455 of `class-wp-query.php` and
`the_posts` around line 3633; the relative order has been the same since at least
6.5.

So what lands in the cache is the **unfiltered** result — the shareable superset —
and anything removed in `the_posts` is removed per request, for this request
only. Filtering there is free in cache terms.

### Why the over-fetch is exactly `count( $exclude )`

Fetching `per_page + count( $exclude )` rows guarantees a full page: at most one
fetched row can be dropped per excluded ID, so at least `per_page` survive. No
second "top-up" query is ever needed, and the fetch size depends only on how many
IDs are being excluded — not on which ones — so it stays stable across URLs.

For page _P_ of a loop the fetch starts at the block's configured offset and asks
for `per_page * P + count( $exclude )` rows, because exclusions shift the page
boundaries. That grows with the page number, which is why there is a ceiling on
it (`hm_query_loop_max_deferred_fetch`, default 100); past the ceiling the query
falls back to excluding in SQL.

## What this plugin does

All of the below applies to **non-inherited** query loops — the ones that build
their own `WP_Query` through `query_loop_block_query_vars`. Inherited loops run
against the main query, which already has a per-URL cache key, so there is much
less to win; see [Not done yet](#not-done-yet).

### 1. Exclusions are applied in PHP

`inc/deferred-exclusions.php` collects the IDs a loop wants to exclude, plans an
over-fetch, and drops them on `the_posts` (priority 9, before the plugin's own
post tracking at 10, so only posts that really render are recorded).

Three sources feed it:

| Source | Varies by |
|---|---|
| The `query.excludeCurrent` block attribute | URL — the worst case |
| This plugin's **Exclude already displayed posts** setting | Position on the page |
| The `hm_query_loop_deferred_exclusions` filter | Whatever you want |

`excludeCurrent` needs a word of explanation, because what it does depends on
the WordPress version. **Core gained the attribute in 7.1**; 7.0 and earlier
ignore it entirely.

From 7.1, core applies it in `build_query_vars_from_query_block()` by appending
`get_the_ID()` to `post__not_in`. The plugin takes that ID back out and handles
it in PHP, so no configuration is needed to get the improvement, and the
rendered output is unchanged.

On 7.0 and earlier the plugin is not taking anything over — it is implementing
the setting. A loop whose block attributes carry `excludeCurrent` starts
excluding the current post where the attribute previously did nothing. That is
what the setting is supposed to do, but on those versions it is a behaviour
change and not only a caching one.

### 2. Post templates share one query

A loop with several `core/post-template` blocks used to give each template its own
narrowed query — a smaller `posts_per_page`, and the preceding templates' post IDs
in `post__not_in`. That is N queries and N cache entries for one result set, and
editing the second template's "posts per template" invalidated the first one's
entry too.

Now every template issues **the loop's own query, unchanged**, and takes its own
window out of the result in PHP. N templates cost one query and one cache entry —
and that entry is the same one a plain single-template loop with the same settings
would use.

### 3. Nothing the plugin tracks reaches the cache key

`generate_cache_key()` strips exactly seven query vars (`cache_results`,
`fields`, `lazy_load_term_meta`, `update_post_meta_cache`,
`update_post_term_cache`, `update_menu_item_cache`, `suppress_filters`) and
serialises everything else. There is no allow-list: **any** custom query var a
plugin passes to `WP_Query` becomes part of the key, whether or not it affects
the SQL.

This plugin used to pass two:

- `query_id` — the loop's `queryId`, which is derived from the post ID, so it gave
  every loop a private cache key on every URL even when nothing else differed.
- `hm_query_loop_collect_ids` — constant, so it did not fragment the cache between
  loops, but it did stop them sharing entries with any identical query from
  outside the plugin.

Both are now passed in a single query var that `bind_context()` strips on
`pre_get_posts` — before the SQL is built and before the key is generated — and
binds to the `WP_Query` instance instead.

`paged` was also being set on non-inherited loops, where `offset` overrides it in
the LIMIT clause. It is now only set where it can actually change the result.

### 4. `found_posts` is corrected per request, not through the filter

The over-fetched query's `found_posts` counts posts that were then dropped, so
pagination has to be adjusted. That happens in `the_posts`, on every request,
rather than through the `found_posts` filter — because `set_found_posts()` only
runs on a **cache miss**, and its result is written into the shared cache entry.
Adjusting it there would bake one URL's correction into every other URL's answer.

Note that the correction is a lower bound: only the fetched window is visible, so
exclusions further down the result set are not counted.

## What it costs

- **A few extra rows per query.** Bounded by `hm_query_loop_max_deferred_fetch`.
- **A `foreach` over the fetched rows on every request**, including cache hits.
  Cheap, but not free — and because the array changes, core takes the
  `_prime_post_caches()` path after `the_posts` rather than its `update_post_caches()`
  fast path.
- **`found_posts` is approximate** for loops that both paginate and exclude.
- **Deep pagination degrades**: page _P_ fetches `per_page * P + n` rows. Past the
  ceiling the old SQL behaviour returns.

Both knobs are filterable:

```php
// Turn PHP-side exclusion off entirely.
add_filter( 'hm_query_loop_defer_exclusions', '__return_false' );

// Allow wider over-fetches (default 100).
add_filter( 'hm_query_loop_max_deferred_fetch', fn () => 250 );
```

And for query presets, which would otherwise reach for `post__not_in`:

```php
\HM\QueryLoop\QueryPresets\register_query_preset(
    'more_like_this',
    'More like this',
    function ( $query_vars, $context ) {
        // Instead of $query_vars['post__not_in'][] = $context['post_id'];
        return \HM\QueryLoop\DeferredExclusions\add_exclusions(
            $query_vars,
            [ $context['post_id'] ]
        );
    }
);
```

## Measured

Benchmarked against the commit this branch merges (`b9f3925`), on **WordPress
6.9 and 7.1**, PHP 8.4, MariaDB on the same host, Twenty Twenty-Five, 601 posts
across six categories. Each "URL" is a full block render with the object cache
persisting between renders, which is what a persistent object cache does between
requests on a site whose content is not being edited.

**A single query loop with no plugin settings at all, across 100 URLs:**

| | WP 6.9 before | WP 6.9 after | WP 7.1 before | WP 7.1 after |
|---|---|---|---|---|
| Database queries | 308 | **110** | 306 | **108** |
| Query-loop `SELECT`s executed | 201 | **3** | 201 | **3** |
| Render time (ms/URL) | 3.94 | **2.92** | 4.61 | **3.38** |

That table is the one worth reading twice. The loop has no exclusion settings, so
none of the over-fetching machinery is doing anything — the entire gain is
[the plugin no longer leaking `query_id` into the cache key](#3-nothing-the-plugin-tracks-reaches-the-cache-key).
Because `query_id` is derived from the post ID, *every* query loop the plugin
touched previously got a private cache entry on every URL it rendered on. Three
distinct queries were being re-executed 201 times purely because their keys
differed.

**A magazine-style page — 12 query loops, two of them split across multiple post
templates, most excluding what earlier loops showed — across 40 URLs:**

| | WP 6.9 before | WP 6.9 after | WP 7.1 before | WP 7.1 after |
|---|---|---|---|---|
| Database queries | 1263 | **72** | 1261 | **70** |
| Query-loop `SELECT`s executed | 1201 | **23** | 1201 | **23** |
| Render time (ms/URL) | 55.3 | **36.4** | 56.1 | **38.3** |
| Posts rendered | 2720 | 2720 | 2720 | 2720 |

**Cost, where there is no cache benefit to be had** — one cold render of the
12-loop page against an empty cache, the worst case for the over-fetching, 15–20
interleaved runs per build:

| | WP 6.9 before | WP 6.9 after | WP 7.1 before | WP 7.1 after |
|---|---|---|---|---|
| Database queries | 87 | 66 | 87 | 66 |
| Render time | 74.9 ms | 73.8 ms | 77.9 ms | 76.6 ms |

The extra rows and the per-request PHP filtering do not show up above the noise,
and the query count still falls because the post templates share one query.

**Rendered output**, compared post by post across 25 URLs per fixture:

| Fixture | WP 6.9 | WP 7.1 |
|---|---|---|
| 12-loop page | identical | identical |
| Plain loop | identical | identical |
| Loop with `excludeCurrent` | **differs on 5 of 25** | identical |

The one divergence is the `excludeCurrent` version difference described above: on
6.9 (and any core up to 7.0) core ignores the attribute, so `before` leaves the current post in its own
"more like this" list and `after` removes it. The URLs that differ are exactly
those where the current post fell inside the window. On 7.1, where core
implements the attribute, the change is output-identical.

**The admin editor is unaffected** on both versions, as expected — no editor
JavaScript changed (the built bundle is byte-identical), and
`query_loop_block_query_vars` does not fire there. Medians of 15 requests, two
rounds each, reported as a range across rounds:

| | WP 6.9 before | WP 6.9 after | WP 7.1 before | WP 7.1 after |
|---|---|---|---|---|
| Block editor (`post.php`) | 218–235 ms | 215–221 ms | 257–265 ms | 251–252 ms |
| Posts list (`edit.php`) | 61–65 ms | 62–63 ms | 72–74 ms | 71–76 ms |
| Site editor | 117–125 ms | 121–125 ms | 138–139 ms | 131–145 ms |
| REST `wp/v2/posts` (loop preview) | 28–30 ms | 28 ms | 41–43 ms | 38–40 ms |

Every gap there is smaller than the spread between two rounds of the *same*
build, so none of it is a real difference.

## Not done yet

Ranked by what they would be worth.

1. **Inherited queries.** `pre_render_block` re-runs the main query with modified
   args, and exclusions there still go into `post__not_in`. The main query's key
   is per-URL anyway, so the gain is smaller — but on an archive with several
   loops it would still collapse several keys into one. The same
   over-fetch-and-filter mechanism applies; the complication is that the main
   query's paging is not built from core's Query Loop offset formula.

2. **Sharing one result set between loops.** Two loops with the same query but
   different `posts_per_page` currently produce two entries. Fetching the wider
   one and slicing both from it in PHP would collapse them — the same trick used
   for post templates, applied across sibling loops with a matching query
   signature.

3. **Quantising `posts_per_page`.** Rounding fetch sizes up to a step (5, 10, 20)
   would make loops asking for 3, 4 and 5 posts share one entry, at the cost of
   fetching a few rows nobody renders.

4. **`no_found_rows` for loops with no pagination block.** Not a cache-key win,
   but it removes the `SELECT FOUND_ROWS()` round trip. It changes the SQL, so it
   must be applied consistently or it fragments the cache instead.

5. **Avoiding needless tax queries.** A query with a `tax_query` mixes the
   `terms` group's `last_changed` into its freshness check as well as `posts`,
   so it is invalidated roughly twice as often. Presets that add an empty or
   redundant tax query pay that for nothing.

## Invalidation

Worth knowing before spending much effort on key cardinality: **any post meta
write, on any post, invalidates every cached query on the site.**
`added_post_meta`, `updated_post_meta` and `deleted_post_meta` are all hooked to
`wp_cache_set_posts_last_changed()`, as is `clean_post_cache()`. On a site with
view counters, "last seen" stamps or similar per-request meta writes, the
`post-queries` group is being flushed constantly and no amount of key sharing
will help.

Before optimising, measure:

```php
add_action( 'wp_cache_set_last_changed', function ( $group, $time, $previous ) {
    if ( 'posts' === $group && $previous ) {
        error_log( 'posts last_changed bumped: ' . wp_debug_backtrace_summary() );
    }
}, 10, 3 );
```

Two version differences also matter:

- **WordPress 6.9** moved `last_changed` out of the cache key and into a salt
  stored inside the cached value, so entries are now overwritten in place instead
  of orphaned. Before 6.9, every invalidation left the whole previous generation
  of keys stranded in the cache until the backend evicted them — so reducing key
  cardinality bounds memory as well as improving the hit rate.
- **Before 6.6** `generate_cache_key()` did not `ksort()` the args, so the *order*
  in which query vars were added changed the key. Building args conditionally
  could fragment the cache on those versions for otherwise identical queries.

## Things that are already fine

- `fields` is stripped from the args and normalised out of the SQL before
  hashing, so `fields => 'ids'` and a full-object query share one cache entry.
- `post__not_in` is sorted in place by core before the key is generated, so its
  order never matters. (`post__in` is not, before 6.8 — sort it yourself if you
  build one.)
- A query is not cached at all if its `ORDER BY` contains `RAND(`, or if a filter
  changed `SELECT` to anything other than `{$wpdb->posts}.*`,
  `{$wpdb->posts}.ID` or `{$wpdb->posts}.ID, {$wpdb->posts}.post_parent`. Worth
  checking before concluding a query "should" be cached.

## A caveat for the ElasticPress path

`posts_pre_query` runs *before* the cache lookup but does not prevent the cache
*write*. A query short-circuited by ElasticPress therefore has its results stored
under a key derived from MySQL SQL that never ran, and later identical requests
serve those results from the object cache without consulting ElasticPress at all.
That is usually a performance win, but it means ElasticPress results are only as
fresh as the `posts` group's `last_changed` — worth an explicit decision on sites
where the index can change independently of WordPress content.
