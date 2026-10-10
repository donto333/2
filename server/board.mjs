import mysql from 'mysql2/promise'

const BOARDS = ['전체', '촉한', '위나라', '오나라']
const FACTIONS = ['촉한', '위나라', '오나라']
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

function postView(row) {
  return {
    id: Number(row.id),
    board: row.board,
    title: row.title,
    content: row.content,
    authorName: row.authorName,
    authorFaction: row.authorFaction,
    createdAt: row.createdAt,
  }
}

export async function listBoardPosts(userId, board) {
  const faction = await currentFaction(userId)
  assertVisible(board, faction)
  const [rows] = await getPool().query(
    'SELECT id,board,title,content,authorName,authorFaction,createdAt FROM game_board_posts WHERE board=? ORDER BY createdAt DESC, id DESC LIMIT 100',
    [board],
  )
  return rows.map(postView)
}

export async function createBoardPost(user, input) {
  const faction = await currentFaction(user.id)
  assertVisible(input.board, faction)
  const title = input.title.trim()
  const content = input.content.trim()
  if (!title || !content) throw new Error('제목과 내용을 입력해 주세요.')
  const name = (user.name ?? '').trim() || '이름 없는 장군'
  const [result] = await getPool().execute(
    'INSERT INTO game_board_posts (board,title,content,authorUserId,authorName,authorFaction) VALUES (?,?,?,?,?,?)',
    [input.board, title, content, user.id, name.slice(0, 64), faction],
  )
  const [rows] = await getPool().query(
    'SELECT id,board,title,content,authorName,authorFaction,createdAt FROM game_board_posts WHERE id=? LIMIT 1',
    [result.insertId],
  )
  return postView(rows[0])
}

export { BOARDS }
