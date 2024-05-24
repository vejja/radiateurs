import sqlite3 from 'sqlite3'

const { Database } = sqlite3
const database = new Database('/home/pi/radiateurs/server/radiateurs.db')

export default database