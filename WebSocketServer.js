const net = require('net');

const clients = new Set();

// Simple HTTP server responds with a simple WebSocket client test
const httpServer = net.createServer((connection) => {
  connection.on('data', () => {
    let content = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
  </head>
  <body>
    WebSocket test page
    <script>
      let ws = new WebSocket('ws://localhost:3001');
      ws.onmessage = event => alert('Message from server: ' + event.data.toString());
      ws.onopen = () => ws.send('hello');
    </script>
  </body>
</html>
`;
    connection.write('HTTP/1.1 200 OK\r\nContent-Length: ' + content.length + '\r\n\r\n' + content);
  });
});
httpServer.listen(3000, () => {
  console.log('HTTP server listening on port 3000');
});

// Incomplete WebSocket server
const wsServer = net.createServer((connection) => {
  console.log('Client connected');
  clients.add(connection);

  connection.on('data', (data) => {
    parseClientDataAndSendResponse(data, connection);
  });

  connection.on('end', () => {
    console.log('Client disconnected');
    clients.delete(connection);
  });
});
wsServer.on('error', (error) => {
  console.error('Error:', error);
  clients.delete(connection);
});
wsServer.listen(3001, () => {
  console.log('WebSocket server listening on port 3001');
});

function extractWebSocketKey(data) {
    //here data should be a string
    let lines = data.split("\r\n");
    let key;
    for (const line of lines) {
        let headerAndValue = line.split(":");
        if (headerAndValue[0].trim() === "Sec-WebSocket-Key") {
            key = headerAndValue[1].trim();
        }
    }
    return key;
}

function computeWebSocketAcceptHash(key) {
    var crypto = require('crypto');
    var shasum = crypto.createHash('sha1');
    shasum.update(key)
    return shasum.digest('base64')
}

function parseClientDataAndSendResponse(data, connection) {
    let dataAsString = data.toString();
    let lines = dataAsString.split("\r\n");
    let isHandshake = false;

    if (lines[0].startsWith("GET")) {
        //Is a client trying to start a websocket connection
        isHandshake = true;
    }

    if (isHandshake) {
        let response = formHandshakeResponse(dataAsString);
        console.log("Server response: " + response);
        connection.write(response);
    } else {
        let firstByte = data[0];
        if ((firstByte & 0b00001111) == 0x8) {
            //close fram
            return;
        }
        //get the message out from the data
        let message = decodedClientMessage(data);
        let serverEncodedMessage = serverEncodeMessage(message);
        broadcast(serverEncodedMessage);
    }
}

function formHandshakeResponse(data) {
    let key = extractWebSocketKey(data);
    const rfc6455Constant = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    let WebSocketAcceptHeaderValue = computeWebSocketAcceptHash(key+rfc6455Constant);

    let response = 
    "HTTP/1.1 101 Switching Protocols\r\n"+
    "Upgrade: websocket\r\n"+
    "Connection: Upgrade\r\n"+
    "Sec-WebSocket-Accept: " + WebSocketAcceptHeaderValue + "\r\n\r\n";
    return response;
}

function broadcast(message) {
    for (let client of clients) {
        client.write(message);
    }
}

function decodedClientMessage(bytes) {
    let length = bytes[1] & 127;
    let maskStart = 2;
    let dataStart = maskStart + 4;
    let stringMessage ="";
    for (let i = dataStart ; i < dataStart + length ; i ++) {
        let byte = bytes [i] ^ bytes [ maskStart + (( i - dataStart ) % 4)];
        stringMessage+=String.fromCharCode(byte);
    }
    console.log("Server got: " + stringMessage);
    return stringMessage;
}

function serverEncodeMessage(message) {
    let messageBuffer = Buffer.from(message, "utf-8");
    let bufferLength = messageBuffer.length;

    let responseFrame = Buffer.alloc(bufferLength + 2);
    responseFrame[0] = 0x81;
    responseFrame[1] = bufferLength;

    messageBuffer.copy(responseFrame, 2);
    return responseFrame;
}