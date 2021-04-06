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
class TOMLError extends Error {
}
class KeyValuePair {
    constructor(key, value1){
        this.key = key;
        this.value = value1;
    }
}
class ParserGroup {
    arrValues = [];
    objValues = {
    };
    constructor(type, name){
        this.type = type;
        this.name = name;
    }
}
class ParserContext {
    output = {
    };
}
class Parser {
    constructor(tomlString){
        this.tomlLines = this._split(tomlString);
        this.context = new ParserContext();
    }
    _sanitize() {
        const out = [];
        for(let i = 0; i < this.tomlLines.length; i++){
            const s = this.tomlLines[i];
            const trimmed = s.trim();
            if (trimmed !== "") {
                out.push(s);
            }
        }
        this.tomlLines = out;
        this._removeComments();
        this._mergeMultilines();
    }
    _removeComments() {
        function isFullLineComment(line) {
            return line.match(/^#/) ? true : false;
        }
        function stringStart(line) {
            const m = line.match(/(?:=\s*\[?\s*)("""|'''|"|')/);
            if (!m) {
                return false;
            }
            openStringSyntax = m[1];
            return true;
        }
        function stringEnd(line) {
            const reg = RegExp(`(?<!(=\\s*))${openStringSyntax}(?!(.*"))`);
            if (!line.match(reg)) {
                return false;
            }
            openStringSyntax = "";
            return true;
        }
        const cleaned = [];
        let isOpenString = false;
        let openStringSyntax = "";
        for(let i = 0; i < this.tomlLines.length; i++){
            const line = this.tomlLines[i];
            if (!isOpenString && stringStart(line)) {
                isOpenString = true;
            }
            if (isOpenString && stringEnd(line)) {
                isOpenString = false;
            }
            if (!isOpenString && !isFullLineComment(line)) {
                const out = line.split(/(?<=([\,\[\]\{\}]|".*"|'.*'|\w(?!.*("|')+))\s*)#/gi);
                cleaned.push(out[0].trim());
            } else if (isOpenString || !isFullLineComment(line)) {
                cleaned.push(line);
            }
            if (isOpenString && (openStringSyntax === "'" || openStringSyntax === '"')) {
                throw new TOMLError(`Single-line string is not closed:\n${line}`);
            }
        }
        if (isOpenString) {
            throw new TOMLError(`Incomplete string until EOF`);
        }
        this.tomlLines = cleaned;
    }
    _mergeMultilines() {
        function arrayStart(line) {
            const reg = /.*=\s*\[/g;
            return reg.test(line) && !(line[line.length - 1] === "]");
        }
        function arrayEnd(line) {
            return line[line.length - 1] === "]";
        }
        function stringStart(line) {
            const m = line.match(/.*=\s*(?:\"\"\"|''')/);
            if (!m) {
                return false;
            }
            return !line.endsWith(`"""`) || !line.endsWith(`'''`);
        }
        function stringEnd(line) {
            return line.endsWith(`'''`) || line.endsWith(`"""`);
        }
        function isLiteralString(line) {
            return line.match(/'''/) ? true : false;
        }
        const merged = [];
        let acc = [], isLiteral = false, capture = false, captureType = "", merge = false;
        for(let i = 0; i < this.tomlLines.length; i++){
            const line = this.tomlLines[i];
            const trimmed = line.trim();
            if (!capture && arrayStart(trimmed)) {
                capture = true;
                captureType = "array";
            } else if (!capture && stringStart(trimmed)) {
                isLiteral = isLiteralString(trimmed);
                capture = true;
                captureType = "string";
            } else if (capture && arrayEnd(trimmed)) {
                merge = true;
            } else if (capture && stringEnd(trimmed)) {
                merge = true;
            }
            if (capture) {
                if (isLiteral) {
                    acc.push(line);
                } else {
                    acc.push(trimmed);
                }
            } else {
                if (isLiteral) {
                    merged.push(line);
                } else {
                    merged.push(trimmed);
                }
            }
            if (merge) {
                capture = false;
                merge = false;
                if (captureType === "string") {
                    merged.push(acc.join("\n").replace(/"""/g, '"').replace(/'''/g, `'`).replace(/\n/g, "\\n"));
                    isLiteral = false;
                } else {
                    merged.push(acc.join(""));
                }
                captureType = "";
                acc = [];
            }
        }
        this.tomlLines = merged;
    }
    _unflat(keys, values = {
    }, cObj = {
    }) {
        const out = {
        };
        if (keys.length === 0) {
            return cObj;
        } else {
            if (Object.keys(cObj).length === 0) {
                cObj = values;
            }
            const key1 = keys.pop();
            if (key1) {
                out[key1] = cObj;
            }
            return this._unflat(keys, values, out);
        }
    }
    _groupToOutput() {
        assert(this.context.currentGroup != null, "currentGroup must be set");
        const arrProperty = this.context.currentGroup.name.replace(/"/g, "").replace(/'/g, "").split(".");
        let u = {
        };
        if (this.context.currentGroup.type === "array") {
            u = this._unflat(arrProperty, this.context.currentGroup.arrValues);
        } else {
            u = this._unflat(arrProperty, this.context.currentGroup.objValues);
        }
        deepAssign(this.context.output, u);
        delete this.context.currentGroup;
    }
    _split(str) {
        const out = [];
        out.push(...str.split("\n"));
        return out;
    }
    _isGroup(line) {
        const t = line.trim();
        return t[0] === "[" && /\[(.*)\]/.exec(t) ? true : false;
    }
    _isDeclaration(line) {
        return line.split("=").length > 1;
    }
    _createGroup(line) {
        const captureReg = /\[(.*)\]/;
        if (this.context.currentGroup) {
            this._groupToOutput();
        }
        let type1;
        let m = line.match(captureReg);
        assert(m != null, "line mut be matched");
        let name1 = m[1];
        if (name1.match(/\[.*\]/)) {
            type1 = "array";
            m = name1.match(captureReg);
            assert(m != null, "name must be matched");
            name1 = m[1];
        } else {
            type1 = "object";
        }
        this.context.currentGroup = new ParserGroup(type1, name1);
    }
    _processDeclaration(line) {
        const idx = line.indexOf("=");
        const key1 = line.substring(0, idx).trim();
        const value1 = this._parseData(line.slice(idx + 1));
        return new KeyValuePair(key1, value1);
    }
    _parseData(dataString) {
        dataString = dataString.trim();
        switch(dataString[0]){
            case '"':
            case "'":
                return this._parseString(dataString);
            case "[":
            case "{":
                return this._parseInlineTableOrArray(dataString);
            default:
                {
                    const match = /#.*$/.exec(dataString);
                    if (match) {
                        dataString = dataString.slice(0, match.index).trim();
                    }
                    switch(dataString){
                        case "true":
                            return true;
                        case "false":
                            return false;
                        case "inf":
                        case "+inf":
                            return Infinity;
                        case "-inf":
                            return -Infinity;
                        case "nan":
                        case "+nan":
                        case "-nan":
                            return NaN;
                        default:
                            return this._parseNumberOrDate(dataString);
                    }
                }
        }
    }
    _parseInlineTableOrArray(dataString) {
        const invalidArr = /,\]/g.exec(dataString);
        if (invalidArr) {
            dataString = dataString.replace(/,]/g, "]");
        }
        if (dataString[0] === "{" && dataString[dataString.length - 1] === "}" || dataString[0] === "[" && dataString[dataString.length - 1] === "]") {
            const reg = /([a-zA-Z0-9-_\.]*) (=)/gi;
            let result;
            while(result = reg.exec(dataString)){
                const ogVal = result[0];
                const newVal = ogVal.replace(result[1], `"${result[1]}"`).replace(result[2], ":");
                dataString = dataString.replace(ogVal, newVal);
            }
            return JSON.parse(dataString);
        }
        throw new TOMLError("Malformed inline table or array literal");
    }
    _parseString(dataString) {
        const quote = dataString[0];
        if (dataString.startsWith(`"\\n`)) {
            dataString = dataString.replace(`"\\n`, `"`);
        } else if (dataString.startsWith(`'\\n`)) {
            dataString = dataString.replace(`'\\n`, `'`);
        }
        if (dataString.endsWith(`\\n"`)) {
            dataString = dataString.replace(`\\n"`, `"`);
        } else if (dataString.endsWith(`\\n'`)) {
            dataString = dataString.replace(`\\n'`, `'`);
        }
        let value1 = "";
        for(let i = 1; i < dataString.length; i++){
            switch(dataString[i]){
                case "\\":
                    i++;
                    switch(dataString[i]){
                        case "b":
                            value1 += "\b";
                            break;
                        case "t":
                            value1 += "\t";
                            break;
                        case "n":
                            value1 += "\n";
                            break;
                        case "f":
                            value1 += "\f";
                            break;
                        case "r":
                            value1 += "\r";
                            break;
                        case "u":
                        case "U":
                            {
                                const codePointLen = dataString[i] === "u" ? 4 : 6;
                                const codePoint = parseInt("0x" + dataString.slice(i + 1, i + 1 + codePointLen), 16);
                                value1 += String.fromCodePoint(codePoint);
                                i += codePointLen;
                                break;
                            }
                        case "\\":
                            value1 += "\\";
                            break;
                        default:
                            value1 += dataString[i];
                            break;
                    }
                    break;
                case quote:
                    if (dataString[i - 1] !== "\\") {
                        return value1;
                    }
                    break;
                default:
                    value1 += dataString[i];
                    break;
            }
        }
        throw new TOMLError("Incomplete string literal");
    }
    _parseNumberOrDate(dataString) {
        if (this._isDate(dataString)) {
            return new Date(dataString);
        }
        if (this._isLocalTime(dataString)) {
            return dataString;
        }
        const hex = /^(0(?:x|o|b)[0-9a-f_]*)/gi.exec(dataString);
        if (hex && hex[0]) {
            return hex[0].trim();
        }
        const testNumber = this._isParsableNumber(dataString);
        if (testNumber !== false && !isNaN(testNumber)) {
            return testNumber;
        }
        return String(dataString);
    }
    _isLocalTime(str) {
        const reg = /(\d{2}):(\d{2}):(\d{2})/;
        return reg.test(str);
    }
    _isParsableNumber(dataString) {
        const m = /((?:\+|-|)[0-9_\.e+\-]*)[^#]/i.exec(dataString);
        if (!m) {
            return false;
        } else {
            return parseFloat(m[0].replace(/_/g, ""));
        }
    }
    _isDate(dateStr) {
        const reg = /\d{4}-\d{2}-\d{2}/;
        return reg.test(dateStr);
    }
    _parseDeclarationName(declaration) {
        const out = [];
        let acc = [];
        let inLiteral = false;
        for(let i = 0; i < declaration.length; i++){
            const c = declaration[i];
            switch(c){
                case ".":
                    if (!inLiteral) {
                        out.push(acc.join(""));
                        acc = [];
                    } else {
                        acc.push(c);
                    }
                    break;
                case `"`:
                    if (inLiteral) {
                        inLiteral = false;
                    } else {
                        inLiteral = true;
                    }
                    break;
                default:
                    acc.push(c);
                    break;
            }
        }
        if (acc.length !== 0) {
            out.push(acc.join(""));
        }
        return out;
    }
    _parseLines() {
        for(let i = 0; i < this.tomlLines.length; i++){
            const line = this.tomlLines[i];
            if (this._isGroup(line)) {
                if (this.context.currentGroup && this.context.currentGroup.type === "array") {
                    this.context.currentGroup.arrValues.push(this.context.currentGroup.objValues);
                    this.context.currentGroup.objValues = {
                    };
                }
                if (!this.context.currentGroup || this.context.currentGroup && this.context.currentGroup.name !== line.replace(/\[/g, "").replace(/\]/g, "")) {
                    this._createGroup(line);
                    continue;
                }
            }
            if (this._isDeclaration(line)) {
                const kv = this._processDeclaration(line);
                const key1 = kv.key;
                const value1 = kv.value;
                if (!this.context.currentGroup) {
                    this.context.output[key1] = value1;
                } else {
                    this.context.currentGroup.objValues[key1] = value1;
                }
            }
        }
        if (this.context.currentGroup) {
            if (this.context.currentGroup.type === "array") {
                this.context.currentGroup.arrValues.push(this.context.currentGroup.objValues);
            }
            this._groupToOutput();
        }
    }
    _cleanOutput() {
        this._propertyClean(this.context.output);
    }
    _propertyClean(obj) {
        const keys = Object.keys(obj);
        for(let i = 0; i < keys.length; i++){
            let k = keys[i];
            if (k) {
                let v = obj[k];
                const pathDeclaration = this._parseDeclarationName(k);
                delete obj[k];
                if (pathDeclaration.length > 1) {
                    const shift = pathDeclaration.shift();
                    if (shift) {
                        k = shift.replace(/"/g, "");
                        v = this._unflat(pathDeclaration, v);
                    }
                } else {
                    k = k.replace(/"/g, "");
                }
                obj[k] = v;
                if (v instanceof Object) {
                    this._propertyClean(v);
                }
            }
        }
    }
    parse() {
        this._sanitize();
        this._parseLines();
        this._cleanOutput();
        return this.context.output;
    }
}
function joinKeys(keys) {
    return keys.map((str)=>{
        return str.match(/[^A-Za-z0-9_-]/) ? `"${str}"` : str;
    }).join(".");
}
class Dumper {
    maxPad = 0;
    output = [];
    constructor(srcObjc){
        this.srcObject = srcObjc;
    }
    dump() {
        this.output = this._parse(this.srcObject);
        this.output = this._format();
        return this.output;
    }
    _parse(obj, keys = []) {
        const out = [];
        const props = Object.keys(obj);
        const propObj = props.filter((e)=>{
            if (obj[e] instanceof Array) {
                const d = obj[e];
                return !this._isSimplySerializable(d[0]);
            }
            return !this._isSimplySerializable(obj[e]);
        });
        const propPrim = props.filter((e)=>{
            if (obj[e] instanceof Array) {
                const d = obj[e];
                return this._isSimplySerializable(d[0]);
            }
            return this._isSimplySerializable(obj[e]);
        });
        const k = propPrim.concat(propObj);
        for(let i = 0; i < k.length; i++){
            const prop = k[i];
            const value1 = obj[prop];
            if (value1 instanceof Date) {
                out.push(this._dateDeclaration([
                    prop
                ], value1));
            } else if (typeof value1 === "string" || value1 instanceof RegExp) {
                out.push(this._strDeclaration([
                    prop
                ], value1.toString()));
            } else if (typeof value1 === "number") {
                out.push(this._numberDeclaration([
                    prop
                ], value1));
            } else if (typeof value1 === "boolean") {
                out.push(this._boolDeclaration([
                    prop
                ], value1));
            } else if (value1 instanceof Array && this._isSimplySerializable(value1[0])) {
                out.push(this._arrayDeclaration([
                    prop
                ], value1));
            } else if (value1 instanceof Array && !this._isSimplySerializable(value1[0])) {
                for(let i1 = 0; i1 < value1.length; i1++){
                    out.push("");
                    out.push(this._headerGroup([
                        ...keys,
                        prop
                    ]));
                    out.push(...this._parse(value1[i1], [
                        ...keys,
                        prop
                    ]));
                }
            } else if (typeof value1 === "object") {
                out.push("");
                out.push(this._header([
                    ...keys,
                    prop
                ]));
                if (value1) {
                    const toParse = value1;
                    out.push(...this._parse(toParse, [
                        ...keys,
                        prop
                    ]));
                }
            }
        }
        out.push("");
        return out;
    }
    _isSimplySerializable(value) {
        return typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value instanceof RegExp || value instanceof Date || value instanceof Array;
    }
    _header(keys) {
        return `[${joinKeys(keys)}]`;
    }
    _headerGroup(keys) {
        return `[[${joinKeys(keys)}]]`;
    }
    _declaration(keys) {
        const title = joinKeys(keys);
        if (title.length > this.maxPad) {
            this.maxPad = title.length;
        }
        return `${title} = `;
    }
    _arrayDeclaration(keys, value) {
        return `${this._declaration(keys)}${JSON.stringify(value)}`;
    }
    _strDeclaration(keys, value) {
        return `${this._declaration(keys)}"${value}"`;
    }
    _numberDeclaration(keys, value) {
        switch(value){
            case Infinity:
                return `${this._declaration(keys)}inf`;
            case -Infinity:
                return `${this._declaration(keys)}-inf`;
            default:
                return `${this._declaration(keys)}${value}`;
        }
    }
    _boolDeclaration(keys, value) {
        return `${this._declaration(keys)}${value}`;
    }
    _dateDeclaration(keys, value) {
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
        return `${this._declaration(keys)}${fData}`;
    }
    _format() {
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
function parse1(tomlString1) {
    tomlString1 = tomlString1.replace(/\r\n/g, "\n").replace(/\\\n/g, "\n");
    return new Parser(tomlString1).parse();
}
export { stringify1 as stringify };
export { parse1 as parse };

