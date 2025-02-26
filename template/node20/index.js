// Copyright (c) Alex Ellis 2021. All rights reserved.
// Copyright (c) OpenFaaS Author(s) 2021. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

"use strict"

require('dotenv/config');
const express = require('express')
const path = require('path');
const fs = require('fs');
const app = express();
const bodyParser = require('body-parser')

// 先确定路径（返回字符串），再统一 require
const handlerPath = fs.existsSync(path.join(process.cwd(), 'handler.js'))
  ? path.join(process.cwd(), 'handler.js')
  : './function/handler';

const handler = require(handlerPath);

const debug = require('debug');

const log = debug('node20:info');


const defaultMaxSize = '100kb' // body-parser default

app.disable('x-powered-by');

const rawLimit = process.env.MAX_RAW_SIZE || defaultMaxSize
const jsonLimit = process.env.MAX_JSON_SIZE || defaultMaxSize

app.use(function addDefaultContentType(req, res, next) {
    // When no content-type is given, the body element is set to
    // nil, and has been a source of contention for new users.

    if (!req.headers['content-type']) {
        req.headers['content-type'] = "text/plain"
    }
    next()
})

if (process.env.RAW_BODY === 'true') {
    app.use(bodyParser.raw({type: '*/*', limit: rawLimit}))
} else {
    app.use(bodyParser.text({type: "text/*"}));
    app.use(bodyParser.json({limit: jsonLimit}));
    app.use(bodyParser.urlencoded({extended: true}));
}

const isArray = (a) => {
    return (!!a) && (a.constructor === Array);
};

const isObject = (a) => {
    return (!!a) && (a.constructor === Object);
};

class FunctionEvent {
    constructor(req) {
        this.body = req.body;
        this.headers = req.headers;
        this.method = req.method;
        this.query = req.query;
        this.path = req.path;
    }
}

class FunctionContext {
    constructor(cb) {
        this.statusCode = 200;
        this.cb = cb;
        this.headerValues = {};
        this.cbCalled = 0;
    }

    status(statusCode) {
        if (!statusCode) {
            return this.statusCode;
        }

        this.statusCode = statusCode;
        return this;
    }

    headers(value) {
        if (!value) {
            return this.headerValues;
        }

        this.headerValues = value;
        return this;
    }

    succeed(value) {
        let err;
        this.cbCalled++;
        this.cb(err, value);
    }

    fail(value) {
        let message;
        if (this.status() === 200) {
            this.status(500)
        }

        this.cbCalled++;
        this.cb(value, message);
    }
}

// 添加资源文件扩展名检查函数
const isResourceRequest = (path) => {
    const resourceExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot'];
    return resourceExtensions.some(ext => path.toLowerCase().endsWith(ext));
};

const middleware = async (req, res) => {
    // 如果是资源请求，直接返回404
    if (isResourceRequest(req.path)) {
        return res.status(404).send('Not found');
    }

    const cb = (err, functionResult) => {
        if (err) {
            console.error(err);

            return res.status(fnContext.status())
                .send(err.toString ? err.toString() : err);
        }

        if (isArray(functionResult) || isObject(functionResult)) {
            res.set(fnContext.headers())
                .status(fnContext.status()).send(JSON.stringify(functionResult));
        } else {
            res.set(fnContext.headers())
                .status(fnContext.status())
                .send(functionResult);
        }
    };

    const fnEvent = new FunctionEvent(req);
    const fnContext = new FunctionContext(cb);

    Promise.resolve(handler(fnEvent, fnContext, cb))
        .then(res => {
            if (!fnContext.cbCalled) {
                fnContext.succeed(res);
            }
        })
        .catch(e => {
            cb(e);
        });
};

app.post('/*', middleware);
app.get('/*', middleware);
app.patch('/*', middleware);
app.put('/*', middleware);
app.delete('/*', middleware);
app.options('/*', middleware);

const port = process.env.http_port || 3000;



const startServer = () => {
    const server = app.listen(port, () => {
        log(`node20 监听端口: ${port}`);

        process.on('SIGTERM', () => {
            log('收到 SIGTERM 信号，准备关闭...');
            process.exit(0);
        });
    });

    return server;
};

startServer();

