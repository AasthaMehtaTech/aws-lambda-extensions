const http = require('http');

function transformRecord(input) {

    // Step 1: Fix the single quotes and unescape the inner JSON in the message field
    const formattedInput = input
        .replace(/\n/g, "").replace(/\\"/g, '\\\\"') // Replace new lines & spaces

    // Step 2: Parse the entire JSON string (except the message field)
    const result = JSON.parse(JSON.stringify(formattedInput));
    return result;

}
function processBatch(batch) {
    const processedBatch = batch
        .filter((item) => item.type === "function")
        .map((item) => {
            const recordParts = item.record.split("\t");
            const time = recordParts[0];
            const requestId = recordParts[1];
            const level = recordParts[2];
            let data = {};
            let message = '';

            if (level === 'ERROR') {
                const stack = recordParts.slice(3).join("\t");
                data = { stack, level: 'error' };
            } else {
                try {
                    data = transformRecord(recordParts[3]);
                } catch (err) {
                    message = recordParts[3];
                }
            }

            console.log('DEBUG entry:', {message, ...data,});
            return {
                time,
                requestId,
                message,
                ...data,
            };
        });

    return processedBatch;
}

function listen(address, port) {
    const logsQueue = [];
    // init HTTP server for the Logs API subscription
    const server = http.createServer(function (request, response) {
        if (request.method == 'POST') {
            var body = '';
            request.on('data', function (data) {
                body += data;
            });
            request.on('end', function () {
                console.log('Logs listener received: ' + body);
                try {
                    let batch = JSON.parse(body);
                    console.log('DEBUG body:', body);
                    // console.log('DEBUG batch:', batch);
                    const processedBatch = processBatch(batch);
                    console.log('DEBUG processedBatch:', processedBatch);

                    if (processedBatch.length > 0) {
                        logsQueue.push(...processedBatch);
                    }
                } catch (e) {
                    console.log("failed to parse logs");
                }
                response.writeHead(200, {})
                response.end("OK")
            });
        } else {
            console.log('GET');
            response.writeHead(200, {});
            response.end("OK");
        }
    });

    server.listen(port, address);
    console.log(`Listening for logs at http://${address}:${port}`);
    return { logsQueue, server };
}

module.exports = {
    listen,
};
