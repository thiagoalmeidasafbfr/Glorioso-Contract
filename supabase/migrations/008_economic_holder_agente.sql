-- ── Titularidade econômica: incluir 'AGENTE' como detentor ─────────────────
-- Executar APÓS 005_economic_rights.sql. Agentes (empresários/intermediários)
-- também podem deter percentual econômico do atleta, além de Botafogo, clube,
-- o próprio atleta e terceiros.

alter table public.athlete_economic_rights
  drop constraint if exists athlete_economic_rights_holder_type_check;

alter table public.athlete_economic_rights
  add constraint athlete_economic_rights_holder_type_check
  check (holder_type in ('BFR', 'CLUBE', 'AGENTE', 'ATLETA', 'TERCEIRO'));
