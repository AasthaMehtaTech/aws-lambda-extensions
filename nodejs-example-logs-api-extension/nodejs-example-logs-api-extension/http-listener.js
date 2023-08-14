const http = require('http');

function parseRecord(input) {

    // Regular expressions for key and value
    const keyPattern = /(\w+):/g;
    const valuePattern = /(?:'([^']*)'|(?!'|\s*{)([^,}]*))/g;

    // Search regex
    const searchWithRegExp = new RegExp(`${keyPattern.source}\\s*${valuePattern.source}`, 'gm');

    // Find everything that matches with the combined "{key}: {value}" regex sequence
    const matches = [...input.matchAll(searchWithRegExp)];

    // Combine matches into an object
    const parsedRecordObj = {};
    matches.forEach(match => {
        const key = match[1];
        const value = match[2] !== undefined ? match[2] : match[3];
        parsedRecordObj[key] = value;
    });

    return parsedRecordObj;
}
function processBatch(batch) {
    const processedBatch = batch
        .filter((item) => item.type === "function")
        .map((item) => {
            if (process.env.DEBUG_LAYER) {
                console.log('RECORD DEBUG: ', item.record);
            }
            
            let result = {};
            try { // process parseable winston generated logs
                result = JSON.parse(item.record)
            } catch (e) { // process cloudwatch generated logs of format `time req_id level log_record`
                const recordParts = item.record.split("\t");
                if (process.env.DEBUG_LAYER) {
                    console.log('RECORD PARTS DEBUG: ', recordParts);
                }
                const timestamp = recordParts[0];
                const requestId = recordParts[1];
                const level = recordParts[2];
                let data = undefined;

                if (level === 'ERROR') {
                    const stack = recordParts.slice(2).join(" ");
                    if (stack.includes('winston_log_agent')) {
                        data = { stack, level: 'error' };
                    }
                } else {
                    let recordData = recordParts.slice(3).join(" ");
                    if (recordData.includes('winston_log_agent')) {
                        try {
                            data = parseRecord(recordData);
                        } catch (err) {
                            data = { detail: recordData };
                        }
                    }
                }

                result = data ? {
                    timestamp,
                    requestId,
                    ...data,
                } : {};

            }

            if (process.env.DEBUG_LAYER) {
                console.log('PROCESSED RESULT DEBUG: ', result);
            }
            return result;
        });
    return processedBatch.filter(obj => Object.keys(obj).length !== 0);
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
                // console.log('Logs listener received: ' + body);
                try {
                    let batch = JSON.parse(body);
                    const processedBatch = processBatch(batch);
                    // console.log('DEBUG processedBatch:', processedBatch);

                    if (processedBatch.length > 0) {
                        logsQueue.push(...processedBatch);
                    }
                } catch (e) {
                    console.log("failed to parse logs", e);
                }
                response.writeHead(200, {})
                response.end("OK")
            });
        } else {
            response.writeHead(200, {});
            response.end("OK");
        }
    });

    server.listen(port, address);
    // console.log(`Listening for logs at http://${address}:${port}`);
    return { logsQueue, server };
}

module.exports = {
    listen,
};
