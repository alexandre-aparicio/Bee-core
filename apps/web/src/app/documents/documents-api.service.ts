import { Injectable } from "@angular/core";

/**
 * Documents transport boundary: centralizes the module API base and request
 * dispatch while leaving document/folder endpoint semantics in the module.
 */
@Injectable()
export class DocumentsApiService {
  readonly apiBase = "/api";

  request(url: string, init: RequestInit = {}): Promise<Response> {
    return fetch(url, {
      credentials: init.credentials ?? "same-origin",
      ...init
    });
  }
}
