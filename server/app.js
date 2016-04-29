var WebSocketServer = require('ws').Server;
var wss = new WebSocketServer({port: 3000});
var teleinfo = require('./monitor');
	


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
	//console.log(source, 'websocket connected');


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
					console.log('command: syntax error');
					return;
				}
				teleinfo.setCommandForHeater(message.data.command, message.data.id);
				break;

			case 'uniformCommand' :
				if (!('data' in message)) {
					console.log('uniformCommand: syntax error');
					return;
				}
				teleinfo.setCommandForAllHeaters(message.data);
				break;

			case 'loadAllHeaters' :
				teleinfo.getHeaters()
				.then(
					function(reply) {
						ws.send(JSON.stringify(reply), null);
					}
				)
				.catch(
					function(err) {
						console.log('getHeaters promise rejected', err);
					}
				);
				break;
		}
	});

	ws.on('close', () => {
		//console.log(source, 'websocket disconnected');
		teleinfo.removeListener('notification', broadcaster);
	});

});
