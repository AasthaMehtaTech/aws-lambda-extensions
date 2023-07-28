const http = require('http');

function parseRecord(input) {

    // Regular expressions for key and value
    const keyPattern = /(\w+):/g;
    const valuePattern = /'([^']*)'/g;

    // Search regex
    const searchWithRegExp = new RegExp(`${keyPattern.source}\\s*${valuePattern.source}`, 'gm');

    // Find everything that matches with the combined "{key}: {value}" regex sequence
    const matches = [...input.matchAll(searchWithRegExp)];

    // Combine matches into an object
    const parsedRecordObj = {};
    matches.forEach(match => {
        const key = match[1];
        const value = match[2];
        parsedRecordObj[key] = value.startsWith('{') ? JSON.parse(value) : value;
    });

    return parsedRecordObj;

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
                const stack = recordParts.slice(3).join(" ");
                data = { stack, level: 'error' };
            } else {
                try {
                    data = parseRecord(recordParts[3]);
                } catch (err) {
                    message = recordParts[3];
                }
            }

            console.log('DEBUG entry:', { message, ...data, });
            const result = {
                time,
                requestId,
                message,
                ...data,
            }
            return JSON.stringify(result);
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
