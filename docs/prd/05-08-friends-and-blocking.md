### 5.8 Friends and blocking

- Send request by username from `/friends`, profile or explore; 5 s cooldown; no self-requests; one pending or accepted request per pair (enforce with a unique index, not only app logic).
- Incoming: accept or decline. Outgoing: cancel. Declined requests can be re-sent.
- Accept writes one ordered `friendships` row and unlocks DMs.
- Unfriend returns both users to stranger state. Block is separate and higher-friction: removes friendship and requests between the two users only, and hides each from the other.

#### Build: friends and blocking

- **Route:** `app/friends/page.tsx` with tab segments; `FriendRow` shared component.
- **Data:** `friend_requests` with unique partial index on `(least(sender_id, receiver_id), greatest(sender_id, receiver_id))` where `status in ('pending','accepted')`; `friendships(user_id_a < user_id_b)` primary key `(user_id_a, user_id_b)`; `blocks` primary key `(blocker_id, blocked_id)`.
- **Actions → SQL functions (security definer, all check `auth.uid()`):** `send_friend_request(target)` (resolves username, rejects self, blocked pairs and duplicates, 5 s rate limit); `respond_friend_request(id, accept)` (receiver only; accept inserts the ordered friendship in the same transaction); `cancel_friend_request(id)` (sender only); `unfriend(other)` (deletes the pair's friendship and the pair's requests only); `block_user(other)` (deletes the pair's friendship and requests, inserts the block).
- **Helpers:** `are_friends(a, b)` and `is_blocked(a, b)` security-definer SQL functions used by RLS across profiles, chat and feed.
- **Realtime:** receiver's sidebar badge subscribes to `friend_requests` inserts for `receiver_id = me`.
- **Done when:** unfriend and block affect only the pair (regression test for the reference build's over-broad deletes); duplicates impossible under parallel sends.
