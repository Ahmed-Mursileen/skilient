### 5.10 Explore

- One search box over people, projects and startups (tabs), 20 results each.
- People results come from the `profiles_public_card` view so everyone is discoverable, exclude the searcher, show friendship status (friends, request sent, request received, none) and skills where visible. Filters: department, skill.

#### Build: explore

- **Route:** `app/explore/page.tsx` with search params `q`, `tab`, `department`, `skill`, `university` (URL is the state, so results are shareable and back-button safe).
- **Search:** Postgres full-text: `profiles_public_card.search` and `ventures.search` generated `tsvector` columns (name, department, skills; title, description, skill tags) with GIN indexes, plus `pg_trgm` for partial names; `search_people(q, filters, cursor)` and `search_ventures(...)` SQL functions return 20 rows each, excluding self and blocked users.
- **Friendship state:** returned by the same function via `left join` on friendships and pending requests, so one round trip.
- **Debounce:** client debounces input 250 ms and cancels in-flight requests.
- **Done when:** search returns in ≤ 300 ms p95 on 50,000 profiles; blocked and self never appear.
