export interface ModelVersion {
  version: number;
  stlBytes: Uint8Array;
  title: string;
  timestamp: number;
}

export interface ModelHistoryEntry {
  version: number;
  title: string;
  timestamp: number;
}

export class ViewerState {
  private _versions: ModelVersion[] = [];
  private _nextVersion = 1;
  private readonly _maxVersions: number;

  constructor(maxVersions = 50) {
    this._maxVersions = maxVersions;
  }

  get versions(): readonly ModelVersion[] {
    return this._versions;
  }

  get latest(): ModelVersion | undefined {
    return this._versions.at(-1);
  }

  addVersion(stlBytes: Uint8Array, title: string): ModelVersion {
    const entry: ModelVersion = {
      version: this._nextVersion++,
      stlBytes, title,
      timestamp: Date.now(),
    };
    this._versions.push(entry);
    while (this._versions.length > this._maxVersions) {
      this._versions.shift();
    }
    return entry;
  }

  getVersion(version: number): ModelVersion | undefined {
    return this._versions.find((v) => v.version === version);
  }

  getHistory(): ModelHistoryEntry[] {
    return this._versions.map(({ version, title, timestamp }) => ({ version, title, timestamp }));
  }
}
