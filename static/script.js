(function() {

  const showToc = document.querySelector(".show-toc");
  showToc.onclick = function() {
    const body = document.body;
    body.classList[body.classList.contains("show-toc") ? "remove": "add"]("show-toc");
  };

  for (const el of document.querySelectorAll("a.link.anchor")) {
    el.parentNode.addEventListener("touchend", function() {
      for (const tapped of document.querySelectorAll(".tapped")) {
          tapped.classList.remove("tapped");
      }
      el.parentNode.classList.add("tapped");
    });
  }
})();
