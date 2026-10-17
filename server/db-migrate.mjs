#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'

const here = dirname(fileURLToPath(import.meta.url))
const files = ['0000_initial_users.sql', '005_game_account_states.sql', '006_game_strategy_state.sql', '007_action_cooldowns.sql', '008_faction_war_score.sql', '009_equipment_system.sql', '010_equipment_payload_capacity.sql', '011_duel_mythic_shop.sql', '012_faction_territories.sql', '013_gold_shop.sql', '014_faction_selection.sql', '014_scenario_state.sql', '015_initial_season_neutral_territories.sql', '016_neutral_territory_ai.sql', '017_luoyang_reward.sql', '018_luoyang_weekly_settlement.sql', '019_city_expansion.sql', '020_save_payload_capacity.sql', '021_faction_boards.sql', '022_board_post_password.sql', '023_reset_board_posts.sql', '024_board_moderation.sql', '025_city_damage_rankings.sql', '026_neutral_ai_battle_logs.sql', '021_city_garrisons.sql', '027_mythic_enhance_stones.sql', '028_grant_ledger.sql', '029_mission_data.sql', '030_squads_and_raid.sql']

async function readMigrations() {
  return Promise.all(files.map(async name => {
    const sql = await readFile(join(here, name), 'utf8')
    return { name, sql, sha256: createHash('sha256').update(sql).digest('hex') }
  }))
}

async function applyMigrations(connection, migrations) {
  await connection.query(`CREATE TABLE IF NOT EXISTS game_app_schema_migrations (
    name VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  )`)
  const [rows] = await connection.query('SELECT name,sha256 FROM game_app_schema_migrations')
  const applied = new Map(rows.map(row => [row.name, row.sha256]))
  for (const migration of migrations) {
    const previous = applied.get(migration.name)
    if (previous && previous !== migration.sha256) throw new Error(`Migration ${migration.name} changed after it was applied`)
    if (previous) continue
    await connection.query(migration.sql)
    await connection.execute('INSERT INTO game_app_schema_migrations (name,sha256) VALUES (?,?)', [migration.name, migration.sha256])
  }
}

if (!process.env.DATABASE_URL) throw new Error('Project DATABASE_URL is required')
const connection = await mysql.createConnection({ uri: process.env.DATABASE_URL, multipleStatements: true, connectTimeout: 5000 })
try {
  await applyMigrations(connection, await readMigrations())
  console.log('Account database migrations are current')
} finally {
  await connection.end()
}
