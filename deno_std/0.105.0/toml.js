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
function deepAssign(target, ...sources) {
    for(let i = 0; i < sources.length; i++){
        const source = sources[i];
        if (!source || typeof source !== `object`) {
            return;
        }
        Object.entries(source).forEach(([key, value])=>{
            if (value instanceof Date) {
                target[key] = new Date(value);
                return;
            }
            if (value instanceof RegExp) {
                target[key] = new RegExp(value);
                return;
            }
            if (!value || typeof value !== `object`) {
                target[key] = value;
                return;
            }
            if (Array.isArray(value)) {
                target[key] = [];
            }
            if (typeof target[key] !== `object` || !target[key]) {
                target[key] = {
                };
            }
            assert(value);
            deepAssign(target[key], value);
        });
    }
    return target;
}
class TOMLParseError extends Error {
}
class Scanner {
    source;
    #whitespace = /[ \t]/;
    #position = 0;
    constructor(source){
        this.source = source;
    }
    char(index = 0) {
        return this.source[this.#position + index] ?? "";
    }
    slice(start, end) {
        return this.source.slice(this.#position + start, this.#position + end);
    }
    next(count) {
        if (typeof count === "number") {
            for(let i = 0; i < count; i++){
                this.#position++;
            }
        } else {
            this.#position++;
        }
    }
    nextUntilChar(options = {
        comment: true
    }) {
        if (options.inline) {
            while(this.#whitespace.test(this.char()) && !this.eof()){
                this.next();
            }
        } else {
            while(!this.eof()){
                const __char = this.char();
                if (this.#whitespace.test(__char) || this.isCurrentCharEOL()) {
                    this.next();
                } else if (options.comment && this.char() === "#") {
                    while(!this.isCurrentCharEOL() && !this.eof()){
                        this.next();
                    }
                } else {
                    break;
                }
            }
        }
        if (!this.isCurrentCharEOL() && /\s/.test(this.char())) {
            const escaped = "\\u" + this.char().charCodeAt(0).toString(16);
            throw new TOMLParseError(`Contains invalid whitespaces: \`${escaped}\``);
        }
    }
    eof() {
        return this.position() >= this.source.length;
    }
    position() {
        return this.#position;
    }
    isCurrentCharEOL() {
        return this.char() === "\n" || this.slice(0, 2) === "\r\n";
    }
}
function success(body) {
    return {
        ok: true,
        body
    };
}
function failure() {
    return {
        ok: false
    };
}
const Utils = {
    unflat (keys, values = {
    }, cObj) {
        const out = {
        };
        if (keys.length === 0) {
            return cObj;
        } else {
            if (!cObj) {
                cObj = values;
            }
            const key = keys[keys.length - 1];
            if (typeof key === "string") {
                out[key] = cObj;
            }
            return this.unflat(keys.slice(0, -1), values, out);
        }
    },
    deepAssignWithTable (target, table) {
        if (table.key.length === 0) {
            throw new Error("Unexpected key length");
        }
        const value = target[table.key[0]];
        if (typeof value === "undefined") {
            Object.assign(target, this.unflat(table.key, table.type === "Table" ? table.value : [
                table.value
            ]));
        } else if (Array.isArray(value)) {
            if (table.type === "TableArray" && table.key.length === 1) {
                value.push(table.value);
            } else {
                const last = value[value.length - 1];
                Utils.deepAssignWithTable(last, {
                    type: table.type,
                    key: table.key.slice(1),
                    value: table.value
                });
            }
        } else if (typeof value === "object" && value !== null) {
            Utils.deepAssignWithTable(value, {
                type: table.type,
                key: table.key.slice(1),
                value: table.value
            });
        } else {
            throw new Error("Unexpected assign");
        }
    }
};
function or(parsers) {
    return function Or(scanner) {
        for (const parse of parsers){
            const result = parse(scanner);
            if (result.ok) {
                return result;
            }
        }
        return failure();
    };
}
function join(parser, separator) {
    const Separator = charactor(separator);
    return function Join(scanner) {
        const first = parser(scanner);
        if (!first.ok) {
            return failure();
        }
        const out = [
            first.body
        ];
        while(!scanner.eof()){
            if (!Separator(scanner).ok) {
                break;
            }
            const result = parser(scanner);
            if (result.ok) {
                out.push(result.body);
            } else {
                throw new TOMLParseError(`Invalid token after "${separator}"`);
            }
        }
        return success(out);
    };
}
function kv(keyParser, separator, valueParser) {
    const Separator = charactor(separator);
    return function Kv(scanner) {
        const key = keyParser(scanner);
        if (!key.ok) {
            return failure();
        }
        const sep = Separator(scanner);
        if (!sep.ok) {
            throw new TOMLParseError(`key/value pair doesn't have "${separator}"`);
        }
        const value = valueParser(scanner);
        if (!value.ok) {
            throw new TOMLParseError(`Value of key/value pair is invalid data format`);
        }
        return success(Utils.unflat(key.body, value.body));
    };
}
function merge(parser) {
    return function Merge(scanner) {
        const result = parser(scanner);
        if (!result.ok) {
            return failure();
        }
        const body = {
        };
        for (const record of result.body){
            if (typeof body === "object" && body !== null) {
                deepAssign(body, record);
            }
        }
        return success(body);
    };
}
function repeat(parser) {
    return function Repeat(scanner) {
        const body = [];
        while(!scanner.eof()){
            const result = parser(scanner);
            if (result.ok) {
                body.push(result.body);
            } else {
                break;
            }
            scanner.nextUntilChar();
        }
        if (body.length === 0) {
            return failure();
        }
        return success(body);
    };
}
function surround(left, parser, right) {
    const Left = charactor(left);
    const Right = charactor(right);
    return function Surround(scanner) {
        if (!Left(scanner).ok) {
            return failure();
        }
        const result = parser(scanner);
        if (!result.ok) {
            throw new TOMLParseError(`Invalid token after "${left}"`);
        }
        if (!Right(scanner).ok) {
            throw new TOMLParseError(`Not closed by "${right}" after started with "${left}"`);
        }
        return success(result.body);
    };
}
function charactor(str) {
    return function Charactor(scanner) {
        scanner.nextUntilChar({
            inline: true
        });
        if (scanner.slice(0, str.length) === str) {
            scanner.next(str.length);
        } else {
            return failure();
        }
        scanner.nextUntilChar({
            inline: true
        });
        return success(undefined);
    };
}
const Patterns = {
    BARE_KEY: /[A-Za-z0-9_-]/,
    FLOAT: /[0-9_\.e+\-]/i,
    END_OF_VALUE: /[ \t\r\n#,}]/
};
function BareKey(scanner) {
    scanner.nextUntilChar({
        inline: true
    });
    if (!scanner.char() || !Patterns.BARE_KEY.test(scanner.char())) {
        return failure();
    }
    const acc = [];
    while(scanner.char() && Patterns.BARE_KEY.test(scanner.char())){
        acc.push(scanner.char());
        scanner.next();
    }
    const key = acc.join("");
    return success(key);
}
function EscapeSequence(scanner) {
    if (scanner.char() === "\\") {
        scanner.next();
        switch(scanner.char()){
            case "b":
                scanner.next();
                return success("\b");
            case "t":
                scanner.next();
                return success("\t");
            case "n":
                scanner.next();
                return success("\n");
            case "f":
                scanner.next();
                return success("\f");
            case "r":
                scanner.next();
                return success("\r");
            case "u":
            case "U":
                {
                    const codePointLen = scanner.char() === "u" ? 4 : 6;
                    const codePoint = parseInt("0x" + scanner.slice(1, 1 + codePointLen), 16);
                    const str = String.fromCodePoint(codePoint);
                    scanner.next(codePointLen + 1);
                    return success(str);
                }
            case '"':
                scanner.next();
                return success('"');
            case "\\":
                scanner.next();
                return success("\\");
            default:
                scanner.next();
                return success(scanner.char());
        }
    } else {
        return failure();
    }
}
function BasicString(scanner) {
    scanner.nextUntilChar({
        inline: true
    });
    if (scanner.char() === '"') {
        scanner.next();
    } else {
        return failure();
    }
    const acc = [];
    while(scanner.char() !== '"' && !scanner.eof()){
        if (scanner.char() === "\n") {
            throw new TOMLParseError("Single-line string cannot contain EOL");
        }
        const escapedChar = EscapeSequence(scanner);
        if (escapedChar.ok) {
            acc.push(escapedChar.body);
        } else {
            acc.push(scanner.char());
            scanner.next();
        }
    }
    if (scanner.eof()) {
        throw new TOMLParseError(`Single-line string is not closed:\n${acc.join("")}`);
    }
    scanner.next();
    return success(acc.join(""));
}
function LiteralString(scanner) {
    scanner.nextUntilChar({
        inline: true
    });
    if (scanner.char() === "'") {
        scanner.next();
    } else {
        return failure();
    }
    const acc = [];
    while(scanner.char() !== "'" && !scanner.eof()){
        if (scanner.char() === "\n") {
            throw new TOMLParseError("Single-line string cannot contain EOL");
        }
        acc.push(scanner.char());
        scanner.next();
    }
    if (scanner.eof()) {
        throw new TOMLParseError(`Single-line string is not closed:\n${acc.join("")}`);
    }
    scanner.next();
    return success(acc.join(""));
}
function MultilineBasicString(scanner) {
    scanner.nextUntilChar({
        inline: true
    });
    if (scanner.slice(0, 3) === '"""') {
        scanner.next(3);
    } else {
        return failure();
    }
    if (scanner.char() === "\n") {
        scanner.next();
    }
    const acc = [];
    while(scanner.slice(0, 3) !== '"""' && !scanner.eof()){
        if (scanner.slice(0, 2) === "\\\n") {
            scanner.next();
            scanner.nextUntilChar({
                comment: false
            });
            continue;
        }
        const escapedChar = EscapeSequence(scanner);
        if (escapedChar.ok) {
            acc.push(escapedChar.body);
        } else {
            acc.push(scanner.char());
            scanner.next();
        }
    }
    if (scanner.eof()) {
        throw new TOMLParseError(`Multi-line string is not closed:\n${acc.join("")}`);
    }
    if (scanner.char(3) === '"') {
        acc.push('"');
        scanner.next();
    }
    scanner.next(3);
    return success(acc.join(""));
}
function MultilineLiteralString(scanner) {
    scanner.nextUntilChar({
        inline: true
    });
    if (scanner.slice(0, 3) === "'''") {
        scanner.next(3);
    } else {
        return failure();
    }
    if (scanner.char() === "\n") {
        scanner.next();
    }
    const acc = [];
    while(scanner.slice(0, 3) !== "'''" && !scanner.eof()){
        acc.push(scanner.char());
        scanner.next();
    }
    if (scanner.eof()) {
        throw new TOMLParseError(`Multi-line string is not closed:\n${acc.join("")}`);
    }
    if (scanner.char(3) === "'") {
        acc.push("'");
        scanner.next();
    }
    scanner.next(3);
    return success(acc.join(""));
}
const symbolPairs = [
    [
        "true",
        true
    ],
    [
        "false",
        false
    ],
    [
        "inf",
        Infinity
    ],
    [
        "+inf",
        Infinity
    ],
    [
        "-inf",
        -Infinity
    ],
    [
        "nan",
        NaN
    ],
    [
        "+nan",
        NaN
    ],
    [
        "-nan",
        NaN
    ], 
];
function Symbols(scanner) {
    scanner.nextUntilChar({
        inline: true
    });
    const found = symbolPairs.find(([str])=>scanner.slice(0, str.length) === str
    );
    if (!found) {
        return failure();
    }
    const [str, value] = found;
    scanner.next(str.length);
    return success(value);
}
const DottedKey = join(or([
    BareKey,
    BasicString,
    LiteralString
]), ".");
function Integer(scanner) {
    scanner.nextUntilChar({
        inline: true
    });
    const first2 = scanner.slice(0, 2);
    if (first2.length === 2 && /0(?:x|o|b)/i.test(first2)) {
        scanner.next(2);
        const acc = [
            first2
        ];
        while(/[0-9a-f_]/i.test(scanner.char()) && !scanner.eof()){
            acc.push(scanner.char());
            scanner.next();
        }
        if (acc.length === 1) {
            return failure();
        }
        return success(acc.join(""));
    }
    const acc = [];
    if (/[+-]/.test(scanner.char())) {
        acc.push(scanner.char());
        scanner.next();
    }
    while(/[0-9_]/.test(scanner.char()) && !scanner.eof()){
        acc.push(scanner.char());
        scanner.next();
    }
    if (acc.length === 0 || acc.length === 1 && /[+-]/.test(acc[0])) {
        return failure();
    }
    const __int = parseInt(acc.filter((__char)=>__char !== "_"
    ).join(""));
    return success(__int);
}
function Float(scanner) {
    scanner.nextUntilChar({
        inline: true
    });
    let position = 0;
    while(scanner.char(position) && !Patterns.END_OF_VALUE.test(scanner.char(position))){
        if (!Patterns.FLOAT.test(scanner.char(position))) {
            return failure();
        }
        position++;
    }
    const acc = [];
    if (/[+-]/.test(scanner.char())) {
        acc.push(scanner.char());
        scanner.next();
    }
    while(Patterns.FLOAT.test(scanner.char()) && !scanner.eof()){
        acc.push(scanner.char());
        scanner.next();
    }
    if (acc.length === 0) {
        return failure();
    }
    const __float = parseFloat(acc.filter((__char)=>__char !== "_"
    ).join(""));
    if (isNaN(__float)) {
        return failure();
    }
    return success(__float);
}
function DateTime(scanner) {
    scanner.nextUntilChar({
        inline: true
    });
    let dateStr = scanner.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        scanner.next(10);
    } else {
        return failure();
    }
    const acc = [];
    while(/[ 0-9TZ.:-]/.test(scanner.char()) && !scanner.eof()){
        acc.push(scanner.char());
        scanner.next();
    }
    dateStr += acc.join("");
    const date = new Date(dateStr.trim());
    if (isNaN(date.getTime())) {
        throw new TOMLParseError(`Invalid date string "${dateStr}"`);
    }
    return success(date);
}
function LocalTime(scanner) {
    scanner.nextUntilChar({
        inline: true
    });
    let timeStr = scanner.slice(0, 8);
    if (/^(\d{2}):(\d{2}):(\d{2})/.test(timeStr)) {
        scanner.next(8);
    } else {
        return failure();
    }
    const acc = [];
    if (scanner.char() === ".") {
        acc.push(scanner.char());
        scanner.next();
    } else {
        return success(timeStr);
    }
    while(/[0-9]/.test(scanner.char()) && !scanner.eof()){
        acc.push(scanner.char());
        scanner.next();
    }
    timeStr += acc.join("");
    return success(timeStr);
}
function ArrayValue(scanner) {
    scanner.nextUntilChar({
        inline: true
    });
    if (scanner.char() === "[") {
        scanner.next();
    } else {
        return failure();
    }
    const array = [];
    while(!scanner.eof()){
        scanner.nextUntilChar();
        const result = Value(scanner);
        if (result.ok) {
            array.push(result.body);
        } else {
            break;
        }
        scanner.nextUntilChar({
            inline: true
        });
        if (scanner.char() === ",") {
            scanner.next();
        } else {
            break;
        }
    }
    scanner.nextUntilChar();
    if (scanner.char() === "]") {
        scanner.next();
    } else {
        throw new TOMLParseError("Array is not closed");
    }
    return success(array);
}
function InlineTable(scanner) {
    scanner.nextUntilChar();
    const pairs = surround("{", join(Pair, ","), "}")(scanner);
    if (!pairs.ok) {
        return failure();
    }
    const table = {
    };
    for (const pair of pairs.body){
        deepAssign(table, pair);
    }
    return success(table);
}
const Value = or([
    MultilineBasicString,
    MultilineLiteralString,
    BasicString,
    LiteralString,
    Symbols,
    DateTime,
    LocalTime,
    Float,
    Integer,
    ArrayValue,
    InlineTable, 
]);
const Pair = kv(DottedKey, "=", Value);
function Block(scanner) {
    scanner.nextUntilChar();
    const result = merge(repeat(Pair))(scanner);
    if (result.ok) {
        return success({
            type: "Block",
            value: result.body
        });
    } else {
        return failure();
    }
}
const TableHeader = surround("[", DottedKey, "]");
function Table(scanner) {
    scanner.nextUntilChar();
    const header = TableHeader(scanner);
    if (!header.ok) {
        return failure();
    }
    scanner.nextUntilChar();
    const block = Block(scanner);
    return success({
        type: "Table",
        key: header.body,
        value: block.ok ? block.body.value : {
        }
    });
}
const TableArrayHeader = surround("[[", DottedKey, "]]");
function TableArray(scanner) {
    scanner.nextUntilChar();
    const header = TableArrayHeader(scanner);
    if (!header.ok) {
        return failure();
    }
    scanner.nextUntilChar();
    const block = Block(scanner);
    return success({
        type: "TableArray",
        key: header.body,
        value: block.ok ? block.body.value : {
        }
    });
}
function Toml(scanner) {
    const blocks = repeat(or([
        Block,
        TableArray,
        Table
    ]))(scanner);
    if (!blocks.ok) {
        return failure();
    }
    const body = {
    };
    for (const block of blocks.body){
        switch(block.type){
            case "Block":
                {
                    deepAssign(body, block.value);
                    break;
                }
            case "Table":
                {
                    Utils.deepAssignWithTable(body, block);
                    break;
                }
            case "TableArray":
                {
                    Utils.deepAssignWithTable(body, block);
                    break;
                }
        }
    }
    return success(body);
}
function ParserFactory(parser) {
    return function parse(tomlString) {
        const scanner = new Scanner(tomlString);
        let parsed = null;
        let err = null;
        try {
            parsed = parser(scanner);
        } catch (e) {
            err = e;
        }
        if (err || !parsed || !parsed.ok || !scanner.eof()) {
            const position = scanner.position();
            const subStr = tomlString.slice(0, position);
            const lines = subStr.split("\n");
            const row = lines.length;
            const column = (()=>{
                let count = subStr.length;
                for (const line of lines){
                    if (count > line.length) {
                        count -= line.length + 1;
                    } else {
                        return count;
                    }
                }
                return count;
            })();
            const message1 = `Parse error on line ${row}, column ${column}: ${err ? err.message : `Unexpected charactor: "${scanner.char()}"`}`;
            throw new TOMLParseError(message1);
        }
        return parsed.body;
    };
}
const parse1 = ParserFactory(Toml);
export { parse1 as parse };
function joinKeys(keys) {
    return keys.map((str)=>{
        return str.match(/[^A-Za-z0-9_-]/) ? `"${str}"` : str;
    }).join(".");
}
var ArrayType;
(function(ArrayType1) {
    ArrayType1[ArrayType1["ONLY_PRIMITIVE"] = 0] = "ONLY_PRIMITIVE";
    ArrayType1[ArrayType1["ONLY_OBJECT_EXCLUDING_ARRAY"] = 1] = "ONLY_OBJECT_EXCLUDING_ARRAY";
    ArrayType1[ArrayType1["MIXED"] = 2] = "MIXED";
})(ArrayType || (ArrayType = {
}));
class Dumper {
    maxPad = 0;
    srcObject;
    output = [];
    #arrayTypeCache = new Map();
    constructor(srcObjc){
        this.srcObject = srcObjc;
    }
    dump() {
        this.output = this.#printObject(this.srcObject);
        this.output = this.#format();
        return this.output;
    }
     #printObject(obj, keys = []) {
        const out = [];
        const props = Object.keys(obj);
        const inlineProps = [];
        const multilinePorps = [];
        for (const prop of props){
            if (this.#isSimplySerializable(obj[prop])) {
                inlineProps.push(prop);
            } else {
                multilinePorps.push(prop);
            }
        }
        const sortedProps = inlineProps.concat(multilinePorps);
        for(let i = 0; i < sortedProps.length; i++){
            const prop1 = sortedProps[i];
            const value = obj[prop1];
            if (value instanceof Date) {
                out.push(this.#dateDeclaration([
                    prop1
                ], value));
            } else if (typeof value === "string" || value instanceof RegExp) {
                out.push(this.#strDeclaration([
                    prop1
                ], value.toString()));
            } else if (typeof value === "number") {
                out.push(this.#numberDeclaration([
                    prop1
                ], value));
            } else if (typeof value === "boolean") {
                out.push(this.#boolDeclaration([
                    prop1
                ], value));
            } else if (value instanceof Array) {
                const arrayType = this.#getTypeOfArray(value);
                if (arrayType === ArrayType.ONLY_PRIMITIVE) {
                    out.push(this.#arrayDeclaration([
                        prop1
                    ], value));
                } else if (arrayType === ArrayType.ONLY_OBJECT_EXCLUDING_ARRAY) {
                    for(let i1 = 0; i1 < value.length; i1++){
                        out.push("");
                        out.push(this.#headerGroup([
                            ...keys,
                            prop1
                        ]));
                        out.push(...this.#printObject(value[i1], [
                            ...keys,
                            prop1
                        ]));
                    }
                } else {
                    const str = value.map((x)=>this.#printAsInlineValue(x)
                    ).join(",");
                    out.push(`${prop1} = [${str}]`);
                }
            } else if (typeof value === "object") {
                out.push("");
                out.push(this.#header([
                    ...keys,
                    prop1
                ]));
                if (value) {
                    const toParse = value;
                    out.push(...this.#printObject(toParse, [
                        ...keys,
                        prop1
                    ]));
                }
            }
        }
        out.push("");
        return out;
    }
     #isPrimitive(value) {
        return value instanceof Date || value instanceof RegExp || [
            "string",
            "number",
            "boolean"
        ].includes(typeof value);
    }
     #getTypeOfArray(arr) {
        if (this.#arrayTypeCache.has(arr)) {
            return this.#arrayTypeCache.get(arr);
        }
        const type = this.#doGetTypeOfArray(arr);
        this.#arrayTypeCache.set(arr, type);
        return type;
    }
     #doGetTypeOfArray(arr) {
        if (!arr.length) {
            return ArrayType.ONLY_PRIMITIVE;
        }
        const onlyPrimitive = this.#isPrimitive(arr[0]);
        if (arr[0] instanceof Array) {
            return ArrayType.MIXED;
        }
        for(let i = 1; i < arr.length; i++){
            if (onlyPrimitive !== this.#isPrimitive(arr[i]) || arr[i] instanceof Array) {
                return ArrayType.MIXED;
            }
        }
        return onlyPrimitive ? ArrayType.ONLY_PRIMITIVE : ArrayType.ONLY_OBJECT_EXCLUDING_ARRAY;
    }
     #printAsInlineValue(value) {
        if (value instanceof Date) {
            return `"${this.#printDate(value)}"`;
        } else if (typeof value === "string" || value instanceof RegExp) {
            return JSON.stringify(value.toString());
        } else if (typeof value === "number") {
            return value;
        } else if (typeof value === "boolean") {
            return value.toString();
        } else if (value instanceof Array) {
            const str = value.map((x)=>this.#printAsInlineValue(x)
            ).join(",");
            return `[${str}]`;
        } else if (typeof value === "object") {
            if (!value) {
                throw new Error("should never reach");
            }
            const str = Object.keys(value).map((key)=>{
                return `${key} = ${this.#printAsInlineValue(value[key])}`;
            }).join(",");
            return `{${str}}`;
        }
        throw new Error("should never reach");
    }
     #isSimplySerializable(value) {
        return typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value instanceof RegExp || value instanceof Date || value instanceof Array && this.#getTypeOfArray(value) !== ArrayType.ONLY_OBJECT_EXCLUDING_ARRAY;
    }
     #header(keys) {
        return `[${joinKeys(keys)}]`;
    }
     #headerGroup(keys) {
        return `[[${joinKeys(keys)}]]`;
    }
     #declaration(keys) {
        const title = joinKeys(keys);
        if (title.length > this.maxPad) {
            this.maxPad = title.length;
        }
        return `${title} = `;
    }
     #arrayDeclaration(keys, value) {
        return `${this.#declaration(keys)}${JSON.stringify(value)}`;
    }
     #strDeclaration(keys, value) {
        return `${this.#declaration(keys)}"${value}"`;
    }
     #numberDeclaration(keys, value) {
        switch(value){
            case Infinity:
                return `${this.#declaration(keys)}inf`;
            case -Infinity:
                return `${this.#declaration(keys)}-inf`;
            default:
                return `${this.#declaration(keys)}${value}`;
        }
    }
     #boolDeclaration(keys, value) {
        return `${this.#declaration(keys)}${value}`;
    }
     #printDate(value) {
        function dtPad(v, lPad = 2) {
            return v.padStart(lPad, "0");
        }
        const m = dtPad((value.getUTCMonth() + 1).toString());
        const d = dtPad(value.getUTCDate().toString());
        const h = dtPad(value.getUTCHours().toString());
        const min = dtPad(value.getUTCMinutes().toString());
        const s = dtPad(value.getUTCSeconds().toString());
        const ms = dtPad(value.getUTCMilliseconds().toString(), 3);
        const fData = `${value.getUTCFullYear()}-${m}-${d}T${h}:${min}:${s}.${ms}`;
        return fData;
    }
     #dateDeclaration(keys, value) {
        return `${this.#declaration(keys)}${this.#printDate(value)}`;
    }
     #format() {
        const rDeclaration = /(.*)\s=/;
        const out = [];
        for(let i = 0; i < this.output.length; i++){
            const l = this.output[i];
            if (l[0] === "[" && l[1] !== "[") {
                if (this.output[i + 1] === "") {
                    i += 1;
                    continue;
                }
                out.push(l);
            } else {
                const m = rDeclaration.exec(l);
                if (m) {
                    out.push(l.replace(m[1], m[1].padEnd(this.maxPad)));
                } else {
                    out.push(l);
                }
            }
        }
        const cleanedOutput = [];
        for(let i1 = 0; i1 < out.length; i1++){
            const l = out[i1];
            if (!(l === "" && out[i1 + 1] === "")) {
                cleanedOutput.push(l);
            }
        }
        return cleanedOutput;
    }
}
function stringify1(srcObj) {
    return new Dumper(srcObj).dump().join("\n");
}
export { stringify1 as stringify };

