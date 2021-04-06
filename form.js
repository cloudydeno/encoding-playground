export function registerParsers(parsers) {
  return function parseNow(raw) {
    for (const [parse, outbox] of parsers) {
      Promise.resolve(raw)
        .then(parse)
        .then(
          data => JSON.stringify(data, null, 2),
          err => err.stack || err)
        .then(
          text => outbox.value = text);
    }
  }
}

export function bindFormState({ form, inputBox, parseNow, location }) {
  form.addEventListener('submit', () => {
    location.hash = `#${encodeURI(inputBox.value)}`;
  });

  inputBox.focus();
  inputBox.addEventListener('paste', () => {
    setTimeout(() => {
      location.hash = `#${encodeURI(inputBox.value)}`;
    }, 1);
  });

  form.querySelector('button').disabled = false;
  inputBox.placeholder = "input text";

  function readHash() {
    const {hash} = location;
    if (hash?.length > 1) {
      const input = decodeURI(hash.slice(1));
      inputBox.value = input;
      parseNow(input);
    }
  }
  readHash();
  return readHash;
}
