alter table public.flow_projects
  add column if not exists goal text,
  add column if not exists target_date date,
  add column if not exists notes text;

update public.flow_projects
set goal = coalesce(goal, description)
where goal is null and description is not null;
