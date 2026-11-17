import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'fs';
import { access, mkdir, readFile, rm, writeFile } from 'fs/promises';
import path from 'path';

@Injectable()
export class StorageService {
  constructor(private readonly config: ConfigService) {}

  root() {
    return path.resolve(this.config.get<string>('STORAGE_ROOT') || path.join(process.cwd(), 'storage'));
  }

  resolve(relativePath: string) {
    const root = this.root();
    const full = path.resolve(root, relativePath);
    const rel = path.relative(root, full);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new BadRequestException('Ruta de archivo inválida.');
    }
    return full;
  }

  async save(relativePath: string, data: Buffer) {
    const normalized = relativePath.replace(/\\/g, '/');
    const full = this.resolve(normalized);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
    return normalized;
  }

  async remove(relativePath: string | null | undefined) {
    if (!relativePath) return;
    const full = this.resolve(relativePath);
    await rm(full, { force: true });
  }

  async exists(relativePath: string) {
    try {
      await access(this.resolve(relativePath));
      return true;
    } catch {
      return false;
    }
  }

  stream(relativePath: string) {
    return createReadStream(this.resolve(relativePath));
  }

  async read(relativePath: string) {
    return readFile(this.resolve(relativePath));
  }
}
