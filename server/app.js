import { WebSocketServer } from 'ws'
import teleinfo from './monitor.js'
import log from './logger.js'
	
let nbSockets = 0

const options = {
  port: 3000,
}


const wss = new WebSocketServer(options, () => {log.info('****************** SERVER STARTED ********************')})

wss.on('connection', function(ws) {
  console.log('websocket connected')

  /**
	 * Sends a message to all connected clients
	 * @param { any } message 
	 */
  function broadcaster(message) {
    ws.send(JSON.stringify(message.detail), function(error) {
      if (error) {
        console.log('error broadcasting notification:', error)
        ws.close()
      }
      else {
        console.log('websocket sent:', message.detail)
      }
    })
  }

  teleinfo.addEventListener('notification', broadcaster)
  ++nbSockets
  log.info('websocket connected, total = ' + nbSockets)

  ws.on('message', (rawMessage) => {
    const messageString = rawMessage.toString()
    console.log('websocket received:', messageString)
    /** @type { any } */
    let message = {}
		
    try {
      message = JSON.parse(messageString)
    } catch {
      //console.log('bad message', e);
      return
    }

    //console.log(source, 'websocket received: ', message, flags);
    switch (message.type) {
    case 'command' :
      if (!('data' in message && 'command' in message.data && 'id' in message.data)) {
        log.error('command: syntax error')
        return
      }
      teleinfo.setCommandForHeater(message.data.command, message.data.id)
      break
    

    case 'uniformCommand' :
      if (!('data' in message)) {
        log.error('uniformCommand: syntax error')
        return
      }
      teleinfo.setCommandForAllHeaters(message.data)
      break
    

    case 'loadAllHeaters' :
      teleinfo.getHeaters()
        .then(reply => ws.send(JSON.stringify(reply)))
        .catch(error => log.error('getHeaters promise rejected', error))
      break
    

    case 'loadHistory' :
      if (!('data' in message)) {
        log.error('loadHistory: syntax error')
        return
      }
      teleinfo.getHistory(message.data)
        .then(reply => ws.send(JSON.stringify(reply)))
        .catch(error => log.error('getHistory promise rejected', error))
      break
    

    }
  })

  ws.on('close', () => {
    teleinfo.removeEventListener('notification', broadcaster)
    --nbSockets
    log.info('websocket disconnected, total = ' + nbSockets)
  })

})
