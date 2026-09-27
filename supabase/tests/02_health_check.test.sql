begin;
select plan(2);

set local role anon;
select is(public.health_check(), true, 'anon can run the health check');
reset role;

set local role authenticated;
select is(public.health_check(), true, 'authenticated can run the health check');
reset role;

select * from finish();
rollback;
