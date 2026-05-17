'use strict';

import swaggerJsdoc from 'swagger-jsdoc';

const spec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'Time Watch API', version: '1.0.0' },
    servers: [{ url: 'http://localhost:3000' }],
    components: {
      securitySchemes: {
        cookieAuth: { type: 'apiKey', in: 'cookie', name: 'token' },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id:                   { type: 'string', format: 'uuid' },
            full_name:            { type: 'string' },
            email:                { type: 'string', format: 'email' },
            role:                 { type: 'string', enum: ['employee', 'admin'] },
            is_active:            { type: 'boolean' },
            must_change_password: { type: 'boolean' },
            created_at:           { type: 'string', format: 'date-time' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            code:    { type: 'string' },
            message: { type: 'string' },
          },
        },
        ValidationErrorResponse: {
          type: 'object',
          properties: {
            code:    { type: 'string', example: 'VALIDATION_ERROR' },
            message: { type: 'string' },
            details: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field:   { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.ts'],
});

export default spec;
