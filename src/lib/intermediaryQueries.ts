// src/lib/intermediaryQueries.ts
// Data access layer for intermediaries and change_log.
// 100% Supabase — no mock fallback.

import { supabase } from './supabase'

// ── Types ─────────────────────────────────────────────────────────────────

export interface Intermediary {
  id: string
  full_name: string
  company_name: string | null
  email: string | null
  phone: string | null
  country: string | null
  license_number: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ChangeLogEntry {
  id: string
  athlete_id: string | null
  table_name: string
  record_id: string
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  user_id: string | null
  user_email: string | null
  created_at: string
}

export type NewIntermediaryInput = Omit<Intermediary, 'id' | 'created_at' | 'updated_at'>

// ── Intermediaries CRUD ───────────────────────────────────────────────────

export async function fetchIntermediaries(): Promise<Intermediary[]> {
  const { data, error } = await supabase
    .from('intermediaries')
    .select('*')
    .order('full_name')
  if (error) throw error
  return data
}

export async function fetchIntermediary(id: string): Promise<Intermediary | null> {
  const { data, error } = await supabase
    .from('intermediaries')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return data
}

export async function createIntermediary(input: NewIntermediaryInput): Promise<Intermediary> {
  const { data, error } = await supabase
    .from('intermediaries')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateIntermediary(
  id: string,
  input: Partial<NewIntermediaryInput>,
): Promise<Intermediary> {
  const { data, error } = await supabase
    .from('intermediaries')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteIntermediary(id: string): Promise<void> {
  const { error } = await supabase
    .from('intermediaries')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ── Change Log ────────────────────────────────────────────────────────────

export async function fetchAthleteChangeLog(athleteId: string): Promise<ChangeLogEntry[]> {
  const { data, error } = await supabase
    .from('change_log')
    .select('*')
    .eq('athlete_id', athleteId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data
}

/**
 * Logs a change to the change_log table.
 * Silently ignores errors so it never breaks the main flow.
 */
export async function logChange(
  athleteId: string | null,
  tableName: string,
  recordId: string,
  operation: 'INSERT' | 'UPDATE' | 'DELETE',
  oldValues: object | null,
  newValues: object | null,
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('change_log').insert({
      athlete_id: athleteId,
      table_name: tableName,
      record_id: recordId,
      operation,
      old_values: oldValues ?? null,
      new_values: newValues ?? null,
      user_id: user?.id ?? null,
      user_email: user?.email ?? null,
    })
  } catch {
    // Intentionally silent — audit logging must never interrupt user operations
  }
}
