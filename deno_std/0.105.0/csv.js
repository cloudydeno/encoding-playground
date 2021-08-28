function concat(...buf) {
    let length = 0;
    for (const b of buf){
        length += b.length;
    }
    const output = new Uint8Array(length);
    let index = 0;
    for (const b1 of buf){
        output.set(b1, index);
        index += b1.length;
    }
    return output;
}
function copy(src, dst, off = 0) {
    off = Math.max(0, Math.min(off, dst.byteLength));
    const dstBytesAvailable = dst.byteLength - off;
    if (src.byteLength > dstBytesAvailable) {
        src = src.subarray(0, dstBytesAvailable);
    }
    dst.set(src, off);
    return src.byteLength;
}
class DenoStdInternalError extends Error {
    constructor(message){
        super(message);
        this.name = "DenoStdInternalError";
    }
}
function assert(expr, msg = "") {
    if (!expr) {
        throw new DenoStdInternalError(msg);
    }
}
const MIN_READ = 32 * 1024;
const MAX_SIZE = 2 ** 32 - 2;
class Buffer {
    #buf;
    #off = 0;
    constructor(ab){
        this.#buf = ab === undefined ? new Uint8Array(0) : new Uint8Array(ab);
    }
    bytes(options = {
        copy: true
    }) {
        if (options.copy === false) return this.#buf.subarray(this.#off);
        return this.#buf.slice(this.#off);
    }
    empty() {
        return this.#buf.byteLength <= this.#off;
    }
    get length() {
        return this.#buf.byteLength - this.#off;
    }
    get capacity() {
        return this.#buf.buffer.byteLength;
    }
    truncate(n) {
        if (n === 0) {
            this.reset();
            return;
        }
        if (n < 0 || n > this.length) {
            throw Error("bytes.Buffer: truncation out of range");
        }
        this.#reslice(this.#off + n);
    }
    reset() {
        this.#reslice(0);
        this.#off = 0;
    }
     #tryGrowByReslice(n) {
        const l = this.#buf.byteLength;
        if (n <= this.capacity - l) {
            this.#reslice(l + n);
            return l;
        }
        return -1;
    }
     #reslice(len) {
        assert(len <= this.#buf.buffer.byteLength);
        this.#buf = new Uint8Array(this.#buf.buffer, 0, len);
    }
    readSync(p) {
        if (this.empty()) {
            this.reset();
            if (p.byteLength === 0) {
                return 0;
            }
            return null;
        }
        const nread = copy(this.#buf.subarray(this.#off), p);
        this.#off += nread;
        return nread;
    }
    read(p) {
        const rr = this.readSync(p);
        return Promise.resolve(rr);
    }
    writeSync(p) {
        const m = this.#grow(p.byteLength);
        return copy(p, this.#buf, m);
    }
    write(p) {
        const n = this.writeSync(p);
        return Promise.resolve(n);
    }
     #grow(n) {
        const m = this.length;
        if (m === 0 && this.#off !== 0) {
            this.reset();
        }
        const i = this.#tryGrowByReslice(n);
        if (i >= 0) {
            return i;
        }
        const c = this.capacity;
        if (n <= Math.floor(c / 2) - m) {
            copy(this.#buf.subarray(this.#off), this.#buf);
        } else if (c + n > MAX_SIZE) {
            throw new Error("The buffer cannot be grown beyond the maximum size.");
        } else {
            const buf = new Uint8Array(Math.min(2 * c + n, MAX_SIZE));
            copy(this.#buf.subarray(this.#off), buf);
            this.#buf = buf;
        }
        this.#off = 0;
        this.#reslice(Math.min(m + n, MAX_SIZE));
        return m;
    }
    grow(n) {
        if (n < 0) {
            throw Error("Buffer.grow: negative count");
        }
        const m = this.#grow(n);
        this.#reslice(m);
    }
    async readFrom(r) {
        let n = 0;
        const tmp = new Uint8Array(MIN_READ);
        while(true){
            const shouldGrow = this.capacity - this.length < MIN_READ;
            const buf = shouldGrow ? tmp : new Uint8Array(this.#buf.buffer, this.length);
            const nread = await r.read(buf);
            if (nread === null) {
                return n;
            }
            if (shouldGrow) this.writeSync(buf.subarray(0, nread));
            else this.#reslice(this.length + nread);
            n += nread;
        }
    }
    readFromSync(r) {
        let n = 0;
        const tmp = new Uint8Array(MIN_READ);
        while(true){
            const shouldGrow = this.capacity - this.length < MIN_READ;
            const buf = shouldGrow ? tmp : new Uint8Array(this.#buf.buffer, this.length);
            const nread = r.readSync(buf);
            if (nread === null) {
                return n;
            }
            if (shouldGrow) this.writeSync(buf.subarray(0, nread));
            else this.#reslice(this.length + nread);
            n += nread;
        }
    }
}
const ANSI_PATTERN = new RegExp([
    "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
    "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))", 
].join("|"), "g");
var DiffType;
(function(DiffType1) {
    DiffType1["removed"] = "removed";
    DiffType1["common"] = "common";
    DiffType1["added"] = "added";
})(DiffType || (DiffType = {
}));
class AssertionError extends Error {
    constructor(message1){
        super(message1);
        this.name = "AssertionError";
    }
}
async function writeAll(w, arr) {
    let nwritten = 0;
    while(nwritten < arr.length){
        nwritten += await w.write(arr.subarray(nwritten));
    }
}
function writeAllSync(w, arr) {
    let nwritten = 0;
    while(nwritten < arr.length){
        nwritten += w.writeSync(arr.subarray(nwritten));
    }
}
const DEFAULT_BUF_SIZE = 4096;
const MIN_BUF_SIZE = 16;
const CR = "\r".charCodeAt(0);
const LF = "\n".charCodeAt(0);
class BufferFullError extends Error {
    partial;
    name = "BufferFullError";
    constructor(partial1){
        super("Buffer full");
        this.partial = partial1;
    }
}
class PartialReadError extends Error {
    name = "PartialReadError";
    partial;
    constructor(){
        super("Encountered UnexpectedEof, data only partially read");
    }
}
class BufReader {
    buf;
    rd;
    r = 0;
    w = 0;
    eof = false;
    static create(r, size = 4096) {
        return r instanceof BufReader ? r : new BufReader(r, size);
    }
    constructor(rd1, size1 = 4096){
        if (size1 < 16) {
            size1 = MIN_BUF_SIZE;
        }
        this._reset(new Uint8Array(size1), rd1);
    }
    size() {
        return this.buf.byteLength;
    }
    buffered() {
        return this.w - this.r;
    }
    async _fill() {
        if (this.r > 0) {
            this.buf.copyWithin(0, this.r, this.w);
            this.w -= this.r;
            this.r = 0;
        }
        if (this.w >= this.buf.byteLength) {
            throw Error("bufio: tried to fill full buffer");
        }
        for(let i = 100; i > 0; i--){
            const rr = await this.rd.read(this.buf.subarray(this.w));
            if (rr === null) {
                this.eof = true;
                return;
            }
            assert(rr >= 0, "negative read");
            this.w += rr;
            if (rr > 0) {
                return;
            }
        }
        throw new Error(`No progress after ${100} read() calls`);
    }
    reset(r) {
        this._reset(this.buf, r);
    }
    _reset(buf, rd) {
        this.buf = buf;
        this.rd = rd;
        this.eof = false;
    }
    async read(p) {
        let rr = p.byteLength;
        if (p.byteLength === 0) return rr;
        if (this.r === this.w) {
            if (p.byteLength >= this.buf.byteLength) {
                const rr1 = await this.rd.read(p);
                const nread = rr1 ?? 0;
                assert(nread >= 0, "negative read");
                return rr1;
            }
            this.r = 0;
            this.w = 0;
            rr = await this.rd.read(this.buf);
            if (rr === 0 || rr === null) return rr;
            assert(rr >= 0, "negative read");
            this.w += rr;
        }
        const copied = copy(this.buf.subarray(this.r, this.w), p, 0);
        this.r += copied;
        return copied;
    }
    async readFull(p) {
        let bytesRead = 0;
        while(bytesRead < p.length){
            try {
                const rr = await this.read(p.subarray(bytesRead));
                if (rr === null) {
                    if (bytesRead === 0) {
                        return null;
                    } else {
                        throw new PartialReadError();
                    }
                }
                bytesRead += rr;
            } catch (err) {
                err.partial = p.subarray(0, bytesRead);
                throw err;
            }
        }
        return p;
    }
    async readByte() {
        while(this.r === this.w){
            if (this.eof) return null;
            await this._fill();
        }
        const c = this.buf[this.r];
        this.r++;
        return c;
    }
    async readString(delim) {
        if (delim.length !== 1) {
            throw new Error("Delimiter should be a single character");
        }
        const buffer = await this.readSlice(delim.charCodeAt(0));
        if (buffer === null) return null;
        return new TextDecoder().decode(buffer);
    }
    async readLine() {
        let line;
        try {
            line = await this.readSlice(LF);
        } catch (err) {
            if (err instanceof Deno.errors.BadResource) {
                throw err;
            }
            let { partial: partial2  } = err;
            assert(partial2 instanceof Uint8Array, "bufio: caught error from `readSlice()` without `partial` property");
            if (!(err instanceof BufferFullError)) {
                throw err;
            }
            if (!this.eof && partial2.byteLength > 0 && partial2[partial2.byteLength - 1] === CR) {
                assert(this.r > 0, "bufio: tried to rewind past start of buffer");
                this.r--;
                partial2 = partial2.subarray(0, partial2.byteLength - 1);
            }
            return {
                line: partial2,
                more: !this.eof
            };
        }
        if (line === null) {
            return null;
        }
        if (line.byteLength === 0) {
            return {
                line,
                more: false
            };
        }
        if (line[line.byteLength - 1] == LF) {
            let drop = 1;
            if (line.byteLength > 1 && line[line.byteLength - 2] === CR) {
                drop = 2;
            }
            line = line.subarray(0, line.byteLength - drop);
        }
        return {
            line,
            more: false
        };
    }
    async readSlice(delim) {
        let s = 0;
        let slice;
        while(true){
            let i = this.buf.subarray(this.r + s, this.w).indexOf(delim);
            if (i >= 0) {
                i += s;
                slice = this.buf.subarray(this.r, this.r + i + 1);
                this.r += i + 1;
                break;
            }
            if (this.eof) {
                if (this.r === this.w) {
                    return null;
                }
                slice = this.buf.subarray(this.r, this.w);
                this.r = this.w;
                break;
            }
            if (this.buffered() >= this.buf.byteLength) {
                this.r = this.w;
                const oldbuf = this.buf;
                const newbuf = this.buf.slice(0);
                this.buf = newbuf;
                throw new BufferFullError(oldbuf);
            }
            s = this.w - this.r;
            try {
                await this._fill();
            } catch (err) {
                err.partial = slice;
                throw err;
            }
        }
        return slice;
    }
    async peek(n) {
        if (n < 0) {
            throw Error("negative count");
        }
        let avail = this.w - this.r;
        while(avail < n && avail < this.buf.byteLength && !this.eof){
            try {
                await this._fill();
            } catch (err) {
                err.partial = this.buf.subarray(this.r, this.w);
                throw err;
            }
            avail = this.w - this.r;
        }
        if (avail === 0 && this.eof) {
            return null;
        } else if (avail < n && this.eof) {
            return this.buf.subarray(this.r, this.r + avail);
        } else if (avail < n) {
            throw new BufferFullError(this.buf.subarray(this.r, this.w));
        }
        return this.buf.subarray(this.r, this.r + n);
    }
}
class AbstractBufBase {
    buf;
    usedBufferBytes = 0;
    err = null;
    size() {
        return this.buf.byteLength;
    }
    available() {
        return this.buf.byteLength - this.usedBufferBytes;
    }
    buffered() {
        return this.usedBufferBytes;
    }
}
class BufWriter extends AbstractBufBase {
    writer;
    static create(writer, size = 4096) {
        return writer instanceof BufWriter ? writer : new BufWriter(writer, size);
    }
    constructor(writer1, size2 = 4096){
        super();
        this.writer = writer1;
        if (size2 <= 0) {
            size2 = DEFAULT_BUF_SIZE;
        }
        this.buf = new Uint8Array(size2);
    }
    reset(w) {
        this.err = null;
        this.usedBufferBytes = 0;
        this.writer = w;
    }
    async flush() {
        if (this.err !== null) throw this.err;
        if (this.usedBufferBytes === 0) return;
        try {
            await writeAll(this.writer, this.buf.subarray(0, this.usedBufferBytes));
        } catch (e) {
            this.err = e;
            throw e;
        }
        this.buf = new Uint8Array(this.buf.length);
        this.usedBufferBytes = 0;
    }
    async write(data) {
        if (this.err !== null) throw this.err;
        if (data.length === 0) return 0;
        let totalBytesWritten = 0;
        let numBytesWritten = 0;
        while(data.byteLength > this.available()){
            if (this.buffered() === 0) {
                try {
                    numBytesWritten = await this.writer.write(data);
                } catch (e) {
                    this.err = e;
                    throw e;
                }
            } else {
                numBytesWritten = copy(data, this.buf, this.usedBufferBytes);
                this.usedBufferBytes += numBytesWritten;
                await this.flush();
            }
            totalBytesWritten += numBytesWritten;
            data = data.subarray(numBytesWritten);
        }
        numBytesWritten = copy(data, this.buf, this.usedBufferBytes);
        this.usedBufferBytes += numBytesWritten;
        totalBytesWritten += numBytesWritten;
        return totalBytesWritten;
    }
}
class BufWriterSync extends AbstractBufBase {
    writer;
    static create(writer, size = 4096) {
        return writer instanceof BufWriterSync ? writer : new BufWriterSync(writer, size);
    }
    constructor(writer2, size3 = 4096){
        super();
        this.writer = writer2;
        if (size3 <= 0) {
            size3 = DEFAULT_BUF_SIZE;
        }
        this.buf = new Uint8Array(size3);
    }
    reset(w) {
        this.err = null;
        this.usedBufferBytes = 0;
        this.writer = w;
    }
    flush() {
        if (this.err !== null) throw this.err;
        if (this.usedBufferBytes === 0) return;
        try {
            writeAllSync(this.writer, this.buf.subarray(0, this.usedBufferBytes));
        } catch (e) {
            this.err = e;
            throw e;
        }
        this.buf = new Uint8Array(this.buf.length);
        this.usedBufferBytes = 0;
    }
    writeSync(data) {
        if (this.err !== null) throw this.err;
        if (data.length === 0) return 0;
        let totalBytesWritten = 0;
        let numBytesWritten = 0;
        while(data.byteLength > this.available()){
            if (this.buffered() === 0) {
                try {
                    numBytesWritten = this.writer.writeSync(data);
                } catch (e) {
                    this.err = e;
                    throw e;
                }
            } else {
                numBytesWritten = copy(data, this.buf, this.usedBufferBytes);
                this.usedBufferBytes += numBytesWritten;
                this.flush();
            }
            totalBytesWritten += numBytesWritten;
            data = data.subarray(numBytesWritten);
        }
        numBytesWritten = copy(data, this.buf, this.usedBufferBytes);
        this.usedBufferBytes += numBytesWritten;
        totalBytesWritten += numBytesWritten;
        return totalBytesWritten;
    }
}
const CHAR_SPACE = " ".charCodeAt(0);
const CHAR_TAB = "\t".charCodeAt(0);
const CHAR_COLON = ":".charCodeAt(0);
const WHITESPACES = [
    CHAR_SPACE,
    CHAR_TAB
];
const decoder = new TextDecoder();
const invalidHeaderCharRegex = /[^\t\x20-\x7e\x80-\xff]/g;
function str(buf) {
    return !buf ? "" : decoder.decode(buf);
}
class TextProtoReader {
    r;
    constructor(r){
        this.r = r;
    }
    async readLine() {
        const s = await this.readLineSlice();
        return s === null ? null : str(s);
    }
    async readMIMEHeader() {
        const m = new Headers();
        let line;
        let buf = await this.r.peek(1);
        if (buf === null) {
            return null;
        } else if (WHITESPACES.includes(buf[0])) {
            line = await this.readLineSlice();
        }
        buf = await this.r.peek(1);
        if (buf === null) {
            throw new Deno.errors.UnexpectedEof();
        } else if (WHITESPACES.includes(buf[0])) {
            throw new Deno.errors.InvalidData(`malformed MIME header initial line: ${str(line)}`);
        }
        while(true){
            const kv = await this.readLineSlice();
            if (kv === null) throw new Deno.errors.UnexpectedEof();
            if (kv.byteLength === 0) return m;
            let i = kv.indexOf(CHAR_COLON);
            if (i < 0) {
                throw new Deno.errors.InvalidData(`malformed MIME header line: ${str(kv)}`);
            }
            const key = str(kv.subarray(0, i));
            if (key == "") {
                continue;
            }
            i++;
            while(i < kv.byteLength && WHITESPACES.includes(kv[i])){
                i++;
            }
            const value = str(kv.subarray(i)).replace(invalidHeaderCharRegex, encodeURI);
            try {
                m.append(key, value);
            } catch  {
            }
        }
    }
    async readLineSlice() {
        let line = new Uint8Array(0);
        let r1 = null;
        do {
            r1 = await this.r.readLine();
            if (r1 !== null && this.skipSpace(r1.line) !== 0) {
                line = concat(line, r1.line);
            }
        }while (r1 !== null && r1.more)
        return r1 === null ? null : line;
    }
    skipSpace(l) {
        let n = 0;
        for (const val of l){
            if (!WHITESPACES.includes(val)) {
                n++;
            }
        }
        return n;
    }
}
class StringReader extends Buffer {
    constructor(s){
        super(new TextEncoder().encode(s).buffer);
    }
}
class MultiReader {
    readers;
    currentIndex = 0;
    constructor(...readers){
        this.readers = readers;
    }
    async read(p) {
        const r1 = this.readers[this.currentIndex];
        if (!r1) return null;
        const result = await r1.read(p);
        if (result === null) {
            this.currentIndex++;
            return 0;
        }
        return result;
    }
}
class LimitedReader {
    reader;
    limit;
    constructor(reader, limit){
        this.reader = reader;
        this.limit = limit;
    }
    async read(p) {
        if (this.limit <= 0) {
            return null;
        }
        if (p.length > this.limit) {
            p = p.subarray(0, this.limit);
        }
        const n = await this.reader.read(p);
        if (n == null) {
            return null;
        }
        this.limit -= n;
        return n;
    }
}
const QUOTE = '"';
const NEWLINE1 = "\r\n";
class StringifyError1 extends Error {
    name = "StringifyError";
}
function getEscapedString(value, sep) {
    if (value === undefined || value === null) return "";
    let str1 = "";
    if (typeof value === "object") str1 = JSON.stringify(value);
    else str1 = String(value);
    if (str1.includes(sep) || str1.includes(NEWLINE1) || str1.includes(QUOTE)) {
        return `${QUOTE}${str1.replaceAll(QUOTE, `${QUOTE}${QUOTE}`)}${QUOTE}`;
    }
    return str1;
}
function normalizeColumn(column) {
    let fn, header, prop;
    if (typeof column === "object") {
        if (Array.isArray(column)) {
            header = String(column[column.length - 1]);
            prop = column;
        } else {
            ({ fn  } = column);
            prop = Array.isArray(column.prop) ? column.prop : [
                column.prop
            ];
            header = typeof column.header === "string" ? column.header : String(prop[prop.length - 1]);
        }
    } else {
        header = String(column);
        prop = [
            column
        ];
    }
    return {
        fn,
        header,
        prop
    };
}
async function getValuesFromItem(item, normalizedColumns) {
    const values = [];
    for (const column of normalizedColumns){
        let value = item;
        for (const prop of column.prop){
            if (typeof value !== "object" || value === null) continue;
            if (Array.isArray(value)) {
                if (typeof prop === "number") value = value[prop];
                else {
                    throw new StringifyError1('Property accessor is not of type "number"');
                }
            } else value = value[prop];
        }
        if (typeof column.fn === "function") value = await column.fn(value);
        values.push(value);
    }
    return values;
}
async function stringify1(data, columns, options = {
}) {
    const { headers , separator: sep  } = {
        headers: true,
        separator: ",",
        ...options
    };
    if (sep.includes(QUOTE) || sep.includes(NEWLINE1)) {
        const message2 = [
            "Separator cannot include the following strings:",
            '  - U+0022: Quotation mark (")',
            "  - U+000D U+000A: Carriage Return + Line Feed (\\r\\n)", 
        ].join("\n");
        throw new StringifyError1(message2);
    }
    const normalizedColumns = columns.map(normalizeColumn);
    let output = "";
    if (headers) {
        output += normalizedColumns.map((column)=>getEscapedString(column.header, sep)
        ).join(sep);
        output += NEWLINE1;
    }
    for (const item of data){
        const values = await getValuesFromItem(item, normalizedColumns);
        output += values.map((value)=>getEscapedString(value, sep)
        ).join(sep);
        output += NEWLINE1;
    }
    return output;
}
export { NEWLINE1 as NEWLINE, stringify1 as stringify, StringifyError1 as StringifyError };
const INVALID_RUNE = [
    "\r",
    "\n",
    '"'
];
const ERR_BARE_QUOTE1 = 'bare " in non-quoted-field';
const ERR_QUOTE1 = 'extraneous or missing " in quoted-field';
const ERR_INVALID_DELIM1 = "Invalid Delimiter";
const ERR_FIELD_COUNT1 = "wrong number of fields";
class ParseError1 extends Error {
    startLine;
    line;
    column;
    constructor(start, line, column, message2){
        super();
        this.startLine = start;
        this.column = column;
        this.line = line;
        if (message2 === ERR_FIELD_COUNT1) {
            this.message = `record on line ${line}: ${message2}`;
        } else if (start !== line) {
            this.message = `record on line ${start}; parse error on line ${line}, column ${column}: ${message2}`;
        } else {
            this.message = `parse error on line ${line}, column ${column}: ${message2}`;
        }
    }
}
function chkOptions(opt) {
    if (!opt.separator) {
        opt.separator = ",";
    }
    if (!opt.trimLeadingSpace) {
        opt.trimLeadingSpace = false;
    }
    if (INVALID_RUNE.includes(opt.separator) || typeof opt.comment === "string" && INVALID_RUNE.includes(opt.comment) || opt.separator === opt.comment) {
        throw new Error(ERR_INVALID_DELIM1);
    }
}
async function readRecord(startLine, reader1, opt = {
    separator: ",",
    trimLeadingSpace: false
}) {
    const tp = new TextProtoReader(reader1);
    let line1 = await readLine(tp);
    let lineIndex = startLine + 1;
    if (line1 === null) return null;
    if (line1.length === 0) {
        return [];
    }
    if (opt.comment && line1[0] === opt.comment) {
        return [];
    }
    assert(opt.separator != null);
    let fullLine = line1;
    let quoteError = null;
    const quote = '"';
    const quoteLen = quote.length;
    const separatorLen = opt.separator.length;
    let recordBuffer = "";
    const fieldIndexes = [];
    parseField: for(;;){
        if (opt.trimLeadingSpace) {
            line1 = line1.trimLeft();
        }
        if (line1.length === 0 || !line1.startsWith(quote)) {
            const i = line1.indexOf(opt.separator);
            let field = line1;
            if (i >= 0) {
                field = field.substring(0, i);
            }
            if (!opt.lazyQuotes) {
                const j = field.indexOf(quote);
                if (j >= 0) {
                    const col = runeCount(fullLine.slice(0, fullLine.length - line1.slice(j).length));
                    quoteError = new ParseError1(startLine + 1, lineIndex, col, ERR_BARE_QUOTE1);
                    break parseField;
                }
            }
            recordBuffer += field;
            fieldIndexes.push(recordBuffer.length);
            if (i >= 0) {
                line1 = line1.substring(i + separatorLen);
                continue parseField;
            }
            break parseField;
        } else {
            line1 = line1.substring(quoteLen);
            for(;;){
                const i = line1.indexOf(quote);
                if (i >= 0) {
                    recordBuffer += line1.substring(0, i);
                    line1 = line1.substring(i + quoteLen);
                    if (line1.startsWith(quote)) {
                        recordBuffer += quote;
                        line1 = line1.substring(quoteLen);
                    } else if (line1.startsWith(opt.separator)) {
                        line1 = line1.substring(separatorLen);
                        fieldIndexes.push(recordBuffer.length);
                        continue parseField;
                    } else if (0 === line1.length) {
                        fieldIndexes.push(recordBuffer.length);
                        break parseField;
                    } else if (opt.lazyQuotes) {
                        recordBuffer += quote;
                    } else {
                        const col = runeCount(fullLine.slice(0, fullLine.length - line1.length - quoteLen));
                        quoteError = new ParseError1(startLine + 1, lineIndex, col, ERR_QUOTE1);
                        break parseField;
                    }
                } else if (line1.length > 0 || !await isEOF(tp)) {
                    recordBuffer += line1;
                    const r1 = await readLine(tp);
                    lineIndex++;
                    line1 = r1 ?? "";
                    fullLine = line1;
                    if (r1 === null) {
                        if (!opt.lazyQuotes) {
                            const col = runeCount(fullLine);
                            quoteError = new ParseError1(startLine + 1, lineIndex, col, ERR_QUOTE1);
                            break parseField;
                        }
                        fieldIndexes.push(recordBuffer.length);
                        break parseField;
                    }
                    recordBuffer += "\n";
                } else {
                    if (!opt.lazyQuotes) {
                        const col = runeCount(fullLine);
                        quoteError = new ParseError1(startLine + 1, lineIndex, col, ERR_QUOTE1);
                        break parseField;
                    }
                    fieldIndexes.push(recordBuffer.length);
                    break parseField;
                }
            }
        }
    }
    if (quoteError) {
        throw quoteError;
    }
    const result = [];
    let preIdx = 0;
    for (const i of fieldIndexes){
        result.push(recordBuffer.slice(preIdx, i));
        preIdx = i;
    }
    return result;
}
async function isEOF(tp) {
    return await tp.r.peek(0) === null;
}
function runeCount(s1) {
    return Array.from(s1).length;
}
async function readLine(tp) {
    let line1;
    const r1 = await tp.readLine();
    if (r1 === null) return null;
    line1 = r1;
    if (await isEOF(tp) && line1.length > 0 && line1[line1.length - 1] === "\r") {
        line1 = line1.substring(0, line1.length - 1);
    }
    if (line1.length >= 2 && line1[line1.length - 2] === "\r" && line1[line1.length - 1] === "\n") {
        line1 = line1.substring(0, line1.length - 2);
        line1 = line1 + "\n";
    }
    return line1;
}
async function readMatrix1(reader1, opt = {
    separator: ",",
    trimLeadingSpace: false,
    lazyQuotes: false
}) {
    const result = [];
    let _nbFields;
    let lineResult;
    let first = true;
    let lineIndex = 0;
    chkOptions(opt);
    for(;;){
        const r1 = await readRecord(lineIndex, reader1, opt);
        if (r1 === null) break;
        lineResult = r1;
        lineIndex++;
        if (first) {
            first = false;
            if (opt.fieldsPerRecord !== undefined) {
                if (opt.fieldsPerRecord === 0) {
                    _nbFields = lineResult.length;
                } else {
                    _nbFields = opt.fieldsPerRecord;
                }
            }
        }
        if (lineResult.length > 0) {
            if (_nbFields && _nbFields !== lineResult.length) {
                throw new ParseError1(lineIndex, lineIndex, null, ERR_FIELD_COUNT1);
            }
            result.push(lineResult);
        }
    }
    return result;
}
async function parse1(input, opt = {
    skipFirstRow: false
}) {
    let r1;
    if (input instanceof BufReader) {
        r1 = await readMatrix1(input, opt);
    } else {
        r1 = await readMatrix1(new BufReader(new StringReader(input)), opt);
    }
    if (opt.skipFirstRow || opt.columns) {
        let headers = [];
        let i = 0;
        if (opt.skipFirstRow) {
            const head = r1.shift();
            assert(head != null);
            headers = head.map((e)=>{
                return {
                    name: e
                };
            });
            i++;
        }
        if (opt.columns) {
            if (typeof opt.columns[0] !== "string") {
                headers = opt.columns;
            } else {
                const h = opt.columns;
                headers = h.map((e)=>{
                    return {
                        name: e
                    };
                });
            }
        }
        return r1.map((e)=>{
            if (e.length !== headers.length) {
                throw `Error number of fields line:${i}`;
            }
            i++;
            const out = {
            };
            for(let j = 0; j < e.length; j++){
                const h = headers[j];
                if (h.parse) {
                    out[h.name] = h.parse(e[j]);
                } else {
                    out[h.name] = e[j];
                }
            }
            if (opt.parse) {
                return opt.parse(out);
            }
            return out;
        });
    }
    if (opt.parse) {
        return r1.map((e)=>{
            assert(opt.parse, "opt.parse must be set");
            return opt.parse(e);
        });
    }
    return r1;
}
export { ERR_BARE_QUOTE1 as ERR_BARE_QUOTE };
export { ERR_QUOTE1 as ERR_QUOTE };
export { ERR_INVALID_DELIM1 as ERR_INVALID_DELIM };
export { ERR_FIELD_COUNT1 as ERR_FIELD_COUNT };
export { ParseError1 as ParseError };
export { readMatrix1 as readMatrix };
export { parse1 as parse };

