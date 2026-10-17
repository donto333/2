import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import mysql from 'mysql2/promise'

const BOARDS = ['전체', '촉한', '위나라', '오나라', '재야']
let pool

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('Database is not available')
    pool = mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 4, connectTimeout: 5000 })
  }
  return pool
}

function assertBoard(board) {
  if (!BOARDS.includes(board)) throw new Error('존재하지 않는 게시판입니다.')
}

async function currentFaction(userId) {
  const [rows] = await getPool().query('SELECT faction FROM game_account_states WHERE userId=? LIMIT 1', [userId])
  return rows[0]?.faction ?? null
}

function assertVisible(board, faction) {
  assertBoard(board)
  if (board !== '전체' && board !== faction) throw new Error('소속 진영 게시판만 이용할 수 있습니다.')
}

/** 연맹 게시판: 화면에서는 '연맹', 저장은 '연맹:<연맹 번호>'(가입한 연맹만) */
const GUILD_BOARD = '연맹'
async function guildBoardKey(userId) {
  const [rows] = await getPool().query('SELECT guildId FROM game_guild_members WHERE userId=? LIMIT 1', [userId])
  const guildId = rows[0]?.guildId
  if (!guildId) throw new Error('연맹에 가입해야 연맹 게시판을 이용할 수 있습니다.')
  return `${GUILD_BOARD}:${guildId}`
}
/** 화면의 게시판 이름 → 저장 이름(진영 확인 포함) */
async function resolveBoard(user, board, faction) {
  if (board === GUILD_BOARD) return guildBoardKey(user.id)
  assertVisible(board, faction)
  return board
}

function hashPassword(password, salt = randomBytes(16)) {
  const passwordSalt = salt.toString('hex')
  const passwordHash = scryptSync(password, salt, 64).toString('hex')
  return { passwordSalt, passwordHash }
}

function passwordMatches(password, saltHex, hashHex) {
  if (!saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function postView(row, userId, isAdmin = false) {
  return {
    id: Number(row.id),
    board: String(row.board).startsWith(`${GUILD_BOARD}:`) && !isAdmin ? GUILD_BOARD : row.board,
    title: row.title,
    content: row.content,
    authorName: row.authorName,
    authorFaction: row.authorFaction,
    createdAt: row.createdAt,
    canDelete: isAdmin || Number(row.authorUserId) === Number(userId),
  }
}

const POST_COLUMNS = 'id,board,title,content,authorUserId,authorName,authorFaction,createdAt,passwordSalt,passwordHash'

export async function getBoardSettings() {
  const [rows] = await getPool().query('SELECT postingEnabled FROM game_board_settings WHERE id=1 LIMIT 1')
  return { postingEnabled: Boolean(rows[0]?.postingEnabled ?? true) }
}

export async function listBoardPosts(user, board) {
  const faction = await currentFaction(user.id)
  const key = await resolveBoard(user, board, faction)
  const [rows] = await getPool().query(`SELECT ${POST_COLUMNS} FROM game_board_posts WHERE board=? ORDER BY createdAt DESC, id DESC LIMIT 100`, [key])
  return rows.map(row => postView(row, user.id, user.role === 'admin'))
}

export async function createBoardPost(user, input) {
  const faction = await currentFaction(user.id)
  const key = await resolveBoard(user, input.board, faction)
  const settings = await getBoardSettings()
  if (!settings.postingEnabled) throw new Error('관리자가 현재 게시글 작성을 제한하고 있습니다.')
  const title = input.title.trim()
  const content = input.content.trim()
  const password = input.password.trim()
  if (!title || !content) throw new Error('제목과 내용을 입력해 주세요.')
  if (password.length < 4) throw new Error('삭제 비밀번호는 4자 이상 입력해 주세요.')
  const name = (user.name ?? '').trim() || '이름 없는 장군'
  const { passwordSalt, passwordHash } = hashPassword(password)
  const [result] = await getPool().execute(
    'INSERT INTO game_board_posts (board,title,content,authorUserId,authorName,authorFaction,passwordSalt,passwordHash) VALUES (?,?,?,?,?,?,?,?)',
    [key, title, content, user.id, name.slice(0, 64), faction, passwordSalt, passwordHash],
  )
  const [rows] = await getPool().query(`SELECT ${POST_COLUMNS} FROM game_board_posts WHERE id=? LIMIT 1`, [result.insertId])
  return postView(rows[0], user.id, user.role === 'admin')
}

export async function deleteBoardPost(user, postId, password) {
  const [rows] = await getPool().query(`SELECT ${POST_COLUMNS} FROM game_board_posts WHERE id=? LIMIT 1`, [postId])
  const post = rows[0]
  if (!post) throw new Error('게시글을 찾을 수 없습니다.')
  if (Number(post.authorUserId) !== Number(user.id)) throw new Error('게시글 작성자만 삭제할 수 있습니다.')
  if (!passwordMatches(password, post.passwordSalt, post.passwordHash)) throw new Error('삭제 비밀번호가 올바르지 않습니다.')
  await getPool().execute('DELETE FROM game_board_posts WHERE id=? AND authorUserId=?', [postId, user.id])
  return { ok: true, id: postId }
}

export async function listAdminBoardPosts() {
  const [rows] = await getPool().query(`SELECT ${POST_COLUMNS} FROM game_board_posts ORDER BY createdAt DESC, id DESC LIMIT 200`)
  return rows.map(row => postView(row, 0, true))
}

export async function deleteBoardPostAsAdmin(postId) {
  const [result] = await getPool().execute('DELETE FROM game_board_posts WHERE id=?', [postId])
  if (!result.affectedRows) throw new Error('게시글을 찾을 수 없습니다.')
  return { ok: true, id: postId }
}

export async function setBoardPostingEnabled(enabled) {
  await getPool().execute('UPDATE game_board_settings SET postingEnabled=? WHERE id=1', [enabled ? 1 : 0])
  return { postingEnabled: Boolean(enabled) }
}

export { BOARDS }
