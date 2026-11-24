import { Controller, Get } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { corsOptions, DEFAULT_WEB_ORIGIN, parseWebOrigins } from './cors.js';

@Controller('ping')
class PingController {
  @Get()
  ping() {
    return { ok: true };
  }
}

describe('parseWebOrigins', () => {
  it('uses the local web app when WEB_ORIGIN is not set or empty', () => {
    expect(parseWebOrigins(undefined)).toEqual([DEFAULT_WEB_ORIGIN]);
    expect(parseWebOrigins('  ')).toEqual([DEFAULT_WEB_ORIGIN]);
  });

  it('reads one origin or a comma separated list', () => {
    expect(parseWebOrigins('https://app.example.com')).toEqual(['https://app.example.com']);
    expect(parseWebOrigins('http://localhost:3000, https://staging.example.com,')).toEqual([
      'http://localhost:3000',
      'https://staging.example.com',
    ]);
  });

  it('refuses "*"', () => {
    expect(() => parseWebOrigins('*')).toThrow(/not allowed/);
    expect(() => parseWebOrigins('http://localhost:3000,*')).toThrow(/not allowed/);
  });

  it('refuses a value that is not a plain origin', () => {
    expect(() => parseWebOrigins('localhost:3000')).toThrow(/invalid origin/);
    expect(() => parseWebOrigins('http://localhost:3000/')).toThrow(/invalid origin/);
    expect(() => parseWebOrigins('http://localhost:3000/app')).toThrow(/invalid origin/);
    expect(() => parseWebOrigins('ftp://example.com')).toThrow(/invalid origin/);
  });
});

describe('CORS answers', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [PingController] }).compile();
    app = moduleRef.createNestApplication();
    app.enableCors(corsOptions('http://localhost:3000'));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers the preflight of the web origin with the Authorization header allowed', async () => {
    const res = await request(app.getHttpServer())
      .options('/ping')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization,content-type');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(res.headers['access-control-allow-headers']).toMatch(/authorization/i);
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('adds the allow-origin header to a normal request from the web origin', async () => {
    const res = await request(app.getHttpServer()).get('/ping').set('Origin', 'http://localhost:3000');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('does not allow another origin', async () => {
    const res = await request(app.getHttpServer())
      .options('/ping')
      .set('Origin', 'http://evil.example.com')
      .set('Access-Control-Request-Method', 'GET');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
