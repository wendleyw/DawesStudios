-- Cover the client foreign keys that cascade when a client is deleted. Neither column had an index
-- leading with client_id: board_preferences' primary key is (user_id, client_id), and the only
-- client_id-leading Playground index is partial to the retired client-level boards.
create index board_preferences_client on public.board_preferences(client_id);
create index playground_boards_client on public.playground_boards(client_id);
