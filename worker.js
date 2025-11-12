// worker.js - All-in-One Proxy Server for Cloudflare Workers
// Similar to: https://restless-glitter-f6c.notdktczn.workers.dev/

export default {
  async fetch(request, env, ctx) {
    return await handleRequest(request);
  },
};

async function handleRequest(request) {
  const url = new URL(request.url);
  
  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    return handleCORS();
  }
  
  // Handle GET requests
  if (request.method === 'GET') {
    return handleGetRequest(url);
  }
  
  // Handle POST requests
  if (request.method === 'POST') {
    return handlePostRequest(request, url);
  }
  
  // Method not allowed
  return jsonResponse({
    status: 'error',
    message: 'Method not allowed'
  }, 405);
}

async function handleGetRequest(url) {
  const targetUrl = url.searchParams.get('url');
  
  // If no URL parameter provided, show usage
  if (!targetUrl) {
    return jsonResponse({
      message: "Proxy Server is running!",
      usage: "Add ?url=URL_ENCODED_URL to fetch content",
      example: `${url.origin}/?url=${encodeURIComponent('https://example.com')}`,
      endpoints: {
        proxy: "/?url=URL",
        test: "/test (POST)",
        status: "/status"
      }
    });
  }
  
  try {
    console.log(`🔄 Fetching: ${targetUrl}`);
    
    // Set headers to mimic a real browser
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
    };
    
    // Make the request to the target URL
    const response = await fetch(targetUrl, {
      headers: headers,
      cf: {
        // Cloudflare specific options
        cacheEverything: false,
        cacheTtl: 300,
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const content = await response.text();
    const responseHeaders = {};
    
    // Convert headers to plain object
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    
    // Prepare JSON response
    const result = {
      status: "success",
      url: targetUrl,
      content: content,
      content_type: response.headers.get('content-type') || 'text/html',
      status_code: response.status,
      headers: responseHeaders
    };
    
    console.log(`✅ Success: ${response.status} - ${content.length} characters`);
    
    return jsonResponse(result);
    
  } catch (error) {
    // Handle errors
    console.error(`❌ Error: ${error.message}`);
    
    return jsonResponse({
      status: "error",
      url: targetUrl,
      error: error.message,
      status_code: 500
    }, 500);
  }
}

async function handlePostRequest(request, url) {
  if (url.pathname === '/test') {
    try {
      const postData = await request.json();
      const testUrl = postData.url;
      
      if (!testUrl) {
        return jsonResponse({
          status: 'error',
          message: "Missing 'url' in POST data"
        }, 400);
      }
      
      const testResult = await testUrlThroughProxy(testUrl, url.origin);
      
      return jsonResponse(testResult);
      
    } catch (error) {
      return jsonResponse({
        status: 'error',
        message: `Error processing POST data: ${error.message}`
      }, 500);
    }
  }
  
  if (url.pathname === '/status') {
    return jsonResponse({
      status: 'running',
      message: 'Proxy server is operational',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  }
  
  // Endpoint not found
  return jsonResponse({
    status: 'error',
    message: 'Endpoint not found'
  }, 404);
}

async function testUrlThroughProxy(testUrl, origin) {
  try {
    const encodedUrl = encodeURIComponent(testUrl);
    const proxyUrl = `${origin}/?url=${encodedUrl}`;
    
    const response = await fetch(proxyUrl);
    const data = await response.json();
    
    if (data.status === 'success') {
      return {
        status: "success",
        url: testUrl,
        content_length: data.content.length,
        status_code: data.status_code,
        content_type: data.content_type,
        proxy_status: "working"
      };
    } else {
      return {
        status: "error",
        url: testUrl,
        error: data.error,
        proxy_status: "error"
      };
    }
  } catch (error) {
    return {
      status: "error",
      url: testUrl,
      error: error.message,
      proxy_status: "failed"
    };
  }
}

function handleCORS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    }
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    }
  });
}

// Quick test function for development
async function quickTest() {
  const testUrl = "https://example.com";
  const encodedUrl = encodeURIComponent(testUrl);
  
  try {
    const response = await fetch(`https://your-worker.your-subdomain.workers.dev/?url=${encodedUrl}`);
    const data = await response.json();
    
    console.log("✅ Proxy test successful!");
    console.log(`   Status: ${data.status}`);
    console.log(`   URL: ${data.url}`);
    console.log(`   Content Length: ${data.content?.length || 0} characters`);
    console.log(`   Status Code: ${data.status_code}`);
    
    return data;
  } catch (error) {
    console.error(`❌ Test failed: ${error}`);
    return null;
  }
}

// Export test function for use in console
if (typeof window !== 'undefined') {
  window.quickTest = quickTest;
}
