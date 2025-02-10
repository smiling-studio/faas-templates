const handler = require('../handler.js');

describe('Handler Function Tests', () => {
  // 模拟 event 对象
  const mockEvent = {
    body: { message: "Hello World" },
    headers: {
      "content-type": "application/json"
    },
    method: "POST",
    query: {},
    path: "/"
  };

  // 模拟 context 对象
  const createMockContext = () => {
    const context = {
      statusCode: 200,
      headerValues: {},
      cbCalled: 0,
      status: function(statusCode) {
        if (!statusCode) return this.statusCode;
        this.statusCode = statusCode;
        return this;
      },
      headers: function(value) {
        if (!value) return this.headerValues;
        this.headerValues = value;
        return this;
      },
      succeed: function(value) {
        this.cbCalled++;
        return value;
      }
    };
    return context;
  };

  test('应该正确处理有效的请求', async () => {
    const mockContext = createMockContext();
    
    const result = await handler(mockEvent, mockContext);
    
    // 验证返回结果
    expect(result).toEqual({
      'body': JSON.stringify(mockEvent.body),
      'content-type': mockEvent.headers["content-type"]
    });
    
    // 验证状态码
    expect(mockContext.statusCode).toBe(200);
  });

  test('应该正确处理不同的 content-type', async () => {
    const textEvent = {
      ...mockEvent,
      body: "Plain text content",
      headers: {
        "content-type": "text/plain"
      }
    };
    
    const mockContext = createMockContext();
    const result = await handler(textEvent, mockContext);
    
    expect(result).toEqual({
      'body': JSON.stringify("Plain text content"),
      'content-type': "text/plain"
    });
  });
});