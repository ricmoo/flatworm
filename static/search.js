"use strict";

(async function() {

  function search(words) {
    const blocks = [ ];
    const tally = { };
    const skipped = [ ];
    const searchWords = { };
    const leftover = words.replace(/([a-z][a-z0-9]*)/ig, (all, word) => {
      word = word.toLowerCase();
      searchWords[word] = true;
      word = "_" + word;
      const found = data.indices[word];
      if (found) {
        found.forEach((block) => {
          blocks.push(block);
          const comps = block.split("/");
          if (tally[block] == null) { tally[block] = 0; }
          if (tally[comps[0]] == null) { tally[comps[0]] = 0; }
          tally[block] += 1;
          tally[comps[0]] += 1;
        });
      }
      return "|";
    });
    leftover.split("|").forEach((junk) => {
      junk = junk.trim();
      if (junk) { skipped.push(junk); }
    });;
    console.log("Skipped:", skipped);
    console.log(blocks);

    const scores = blocks.reduce((accum, block) => {
      const comps = block.split("/");
      accum[block] = 11 * tally[block] + 3 * tally[comps[0]];
      return accum;
    }, { });

    const result = Object.keys(scores);
    result.sort((a, b) => (scores[b] - scores[a]));

    console.log(scores, result);

    let lastComps = [ -1, -1 ];
    const output = [ ];
    result.forEach((block) => {
      const comps = block.split("/").map((v) => parseInt(v));
      const summary = data.summaries[comps[0]];
      const details = summary.blocks[comps[1]];

      if (comps[0] === lastComps[0]) {
        const joiner = (comps[1] === lastComps[1] + 1) ? " ": ".. ";
        output[output.length - 1].text += joiner + details.text;
      } else {
        output.push({
          title: summary.title,
          link: details.link,
          text: details.text
        });
      }

      lastComps = comps;
    });

    return {
        results: output,
        searchWords: searchWords
    };
  }

  const response = await fetch("/v5/search.json");
  const data = await response.json();

  const content = document.querySelector("div.content");
  const footer = document.querySelector("div.content div.footer");

  function htmlify(parent, text, searchWords) {
      let current = [ ];
      function flush() {
        if (current.length > 0) {
          const span = document.createElement("span");
          span.textContent = current.join("");
          parent.appendChild(span);
          current = [ ];
        }
      }

      text.split(/([a-z0-9]+)/ig).forEach((chunk) => {
          if (searchWords[chunk.toLowerCase()]) {
            flush();
            //current = [ ];
            const span = document.createElement("span");
            span.className = "highlight";
            span.textContent = chunk;
            parent.appendChild(span);
          } else {
            current.push(chunk);
          }
      });

      flush();

      return parent;
  }

  function appendBlock(title, body, link, searchWords) {
    title = title.split(/=>|\(/)[0];
    title = title.replace(/--/g, "\xbb");

    const titleA = htmlify(document.createElement(link ? "a": "span"), title, searchWords || { });
    if (link) {
      titleA.setAttribute("href", link);
    }

    const titleH3 = document.createElement("h3");
    titleH3.appendChild(titleA);
    content.insertBefore(titleH3, footer)

    if (body) {
      const bodyP = htmlify(document.createElement("p"), body, searchWords);
      content.insertBefore(bodyP, footer)
    }
  }

  const words = (location.search.split("search=")[1] || "");
  const { results, searchWords } = search(words);
  if (results.length === 0) {
     appendBlock("No Results.")
  } else {
     results.forEach((result) => {
      appendBlock(result.title, result.text, result.link, searchWords);
    });
  }
})();
