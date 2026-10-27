-- Supabase SQL Editor에서 사용자가 실행합니다. 교육용 가상 데이터만 사용합니다.
-- 로그인 없이 전체 일정 조회·추가만 허용합니다. 수정·삭제는 허용하지 않습니다.
begin;

create table if not exists public.wx_tasks (
  id bigint generated always as identity primary key,
  title text not null check (length(btrim(title)) > 0),
  region text not null constraint wx_tasks_region_check
    check (region in ('세종', '대전', '태안', '보령')),
  kind text not null constraint wx_tasks_kind_check
    check (kind in ('야외', '고소', '실내')),
  owner text not null check (length(btrim(owner)) > 0)
);

alter table public.wx_tasks enable row level security;
grant usage on schema public to anon, authenticated;
revoke all on table public.wx_tasks from public, anon, authenticated;
grant select on table public.wx_tasks to anon, authenticated;
grant insert (title, region, kind, owner) on public.wx_tasks to anon, authenticated;
grant usage on sequence public.wx_tasks_id_seq to anon, authenticated;

drop policy if exists wx_tasks_read on public.wx_tasks;
create policy wx_tasks_read on public.wx_tasks
  for select to anon, authenticated using (true);
drop policy if exists wx_tasks_add on public.wx_tasks;
create policy wx_tasks_add on public.wx_tasks
  for insert to anon, authenticated with check (true);

-- 기본 일정 6건. 같은 내용을 가진 일정은 재실행 시 다시 넣지 않습니다.
insert into public.wx_tasks (title, region, kind, owner)
select seed.title, seed.region, seed.kind, seed.owner
from (values
  ('다중이용시설 안전점검', '세종', '야외', '김안전'),
  ('시민 안전체험 행사 운영', '보령', '야외', '이행사'),
  ('옥상 태양광 설비 점검', '태안', '고소', '박설비'),
  ('하천 수위계 확인', '대전', '야외', '최현장'),
  ('청사 외벽 간판 보수', '세종', '고소', '정시설'),
  ('비상연락 훈련', '대전', '실내', '한상황')
) as seed(title, region, kind, owner)
where not exists (
  select 1 from public.wx_tasks as existing
  where existing.title = seed.title and existing.region = seed.region
    and existing.kind = seed.kind and existing.owner = seed.owner
);

commit;
