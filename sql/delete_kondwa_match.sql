-- ============================================================================
-- One-off cleanup: deletes the "vs kondwa" custom match used while testing,
-- and everything that hangs off it (live scoring data, playing XIs,
-- scorecards). Run this once in Supabase's SQL editor; it does nothing if no
-- match matching the name is found, so it's safe to run more than once.
--
-- If you'd rather wipe EVERY match (not just this one), use wipe_matches.sql
-- instead.
-- ============================================================================
do $$
declare mid uuid;
begin
  select id into mid from matches where opponent_name ilike '%kondwa%' limit 1;
  if mid is not null thens
    delete from live_balls where innings_id in (select id from live_innings where match_id = mid);
    delete from live_overs where innings_id in (select id from live_innings where match_id = mid);
    delete from live_innings where match_id = mid;
    delete from playing_xi where match_id = mid;
    delete from playing_xi_submissions where match_id = mid;
    delete from batting_performances where match_id = mid;
    delete from bowling_performances where match_id = mid;
    update match_requests set resulting_match_id = null where resulting_match_id = mid;
    delete from matches where id = mid;
    raise notice 'Deleted match %', mid;
  else
    raise notice 'No match against a team named "kondwa" was found — nothing to delete.';
  end if;
end $$;
