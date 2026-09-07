const BIN_ID = '6a9f4401ffd5d16053eb0b4b';
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}

function unwrapRecord(data) {
  let current = data;

  while (
    current &&
    typeof current === 'object' &&
    current.record &&
    typeof current.record === 'object'
  ) {
    current = current.record;
  }

  return current || {};
}

export default {
  async fetch(request, env) {
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: corsHeaders()
        });
      }

      if (request.method === 'GET') {
        const response = await fetch(JSONBIN_URL, {
          headers: {
            'X-Master-Key': env.JSONBIN_API_KEY
          }
        });

        const text = await response.text();

        if (!response.ok) {
          return new Response(text, {
            status: response.status,
            headers: corsHeaders()
          });
        }

        const data = JSON.parse(text);
        const clean = unwrapRecord(data);

        return new Response(JSON.stringify(clean), {
          status: 200,
          headers: corsHeaders()
        });
      }

      if (request.method === 'PUT') {
        const body = await request.json();

        const response = await fetch(JSONBIN_URL, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-Master-Key': env.JSONBIN_API_KEY
          },
          body: JSON.stringify(body)
        });

        const text = await response.text();

        return new Response(text, {
          status: response.status,
          headers: corsHeaders()
        });
      }

      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        {
          status: 405,
          headers: corsHeaders()
        }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: error.message
        }),
        {
          status: 500,
          headers: corsHeaders()
        }
      );
    }
  }
};
