var WebSocketServer = require('ws').Server;
var teleinfo = require('./monitor');
var log = require('./logger');
	
var nbSockets = 0;
var protocol = "UNTOKENGENEREAUHASARDPOURACCEDERAUSERVEURWEBSOCKET";
var options = {
	port: 3000,
//	handleProtocols: function(protocols, cb) {
//		if (protocols.indexOf(protocol) > -1) {
//			log.info('websocket protocol identification successful');
//			cb(true, protocol);
//		}
//		else {
//			log.error('websocket protocol unauthorized');
//			cb(false, null);
//		}
//	},
};


var wss = new WebSocketServer(options, () => {log.info('****************** SERVER STARTED ********************');});
//log.info(wss);

wss.on('connection', function(ws) {
	//var source = ws.upgradeReq.url;

	var broadcaster = function(message) {
		ws.send(JSON.stringify(message), function(error) {
			if (!error) {
				//console.log('websocket sent: ', message);
			}
			else {
				//console.log('error broadcasting notification: ', error);
				ws.close();
			}
		});
	};

	teleinfo.addListener('notification', broadcaster);
	++nbSockets;
	log.info('websocket connected, total = ' + nbSockets);

	ws.on('message', (messageString, flags) => {

		var message = {};
		
		try {
			message = JSON.parse(messageString);
		} catch (e) {
			//console.log('bad message', e);
			return;
		}

		//console.log(source, 'websocket received: ', message, flags);
		switch (message.type) {
			case 'command' :
				if (!('data' in message && 'command' in message.data && 'id' in message.data)) {
					log.error('command: syntax error');
					return;
				}
				teleinfo.setCommandForHeater(message.data.command, message.data.id);
				break;

			case 'uniformCommand' :
				if (!('data' in message)) {
					log.error('uniformCommand: syntax error');
					return;
				}
				teleinfo.setCommandForAllHeaters(message.data);
				break;

			case 'loadAllHeaters' :
				teleinfo.getHeaters()
				.then(reply => ws.send(JSON.stringify(reply)))
				.catch(err => log.error('getHeaters promise rejected', err));
				break;

			case 'loadHistory' :
				if (!('data' in message)) {
					log.error('loadHistory: syntax error');
					return;
				}
				teleinfo.getHistory(message.data)
				.then(reply => ws.send(JSON.stringify(reply)))
				.catch(err => log.error('getHistory promise rejected', err));
				break;

		}
	});

	ws.on('close', () => {
		teleinfo.removeListener('notification', broadcaster);
		--nbSockets;
		log.info('websocket disconnected, total = ' + nbSockets);
	});

});
