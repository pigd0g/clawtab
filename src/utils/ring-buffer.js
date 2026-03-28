'use strict';

/**
 * Simple ring buffer for bounded storage of log entries.
 */
class RingBuffer {
  constructor(capacity = 1000) {
    this._capacity = capacity;
    this._buffer = [];
    this._start = 0;
    this._count = 0;
  }

  push(item) {
    if (this._count < this._capacity) {
      this._buffer.push(item);
      this._count++;
    } else {
      this._buffer[this._start] = item;
      this._start = (this._start + 1) % this._capacity;
    }
  }

  toArray() {
    if (this._count < this._capacity) {
      return this._buffer.slice();
    }
    return [
      ...this._buffer.slice(this._start),
      ...this._buffer.slice(0, this._start),
    ];
  }

  clear() {
    this._buffer = [];
    this._start = 0;
    this._count = 0;
  }

  get length() {
    return this._count;
  }
}

module.exports = RingBuffer;
