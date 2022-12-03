
(async function() {

  const updateVisible = function(value) {
    value = value.replace(/[^A-Za-z0-9_]/g, " ").trim().toLowerCase();

    if (value === "") {
      document.querySelectorAll(".entry.hide").forEach((el) => {
        el.classList.remove("hide");
      });

      document.querySelectorAll(".entry.init-hide").forEach((el) => {
        el.classList.add("hide");
      });

    } else {
      const hidden = new Set();

      const values = value.split(/\s+/g)
      const matches = (text) => {
          text = text.toLowerCase();
          for (const value of values) {
              if (text.indexOf(value) === -1) { return false; }
          }
          return true;
      };

      document.querySelectorAll(".entry").forEach((el) => {
        const pid = el.dataset.pid;
        if (pid && hidden.has(pid)) {
          el.classList.add("hide");
        } else if (matches(el.dataset.text)) {
          el.classList.remove("hide");
        } else {
          hidden.add(el.dataset.uid);
          el.classList.add("hide");
        }
      });
    }

    document.querySelectorAll(".group").forEach((el) => {
        const showing = el.querySelectorAll(".entry:not(.entry.hide)");
        console.log({ g: el.dataset.text, count: showing.length });
        if (showing.length === 0) {
          el.classList.add("hide");
        } else {
          el.classList.remove("hide");
        }
    });
  };

  {
    //let nextPid = 1;
    //let lastParent = null;
    let nextUid = 1;
    let lastParent = null;
    document.querySelectorAll(".entry").forEach((el, index) => {
      const uid = `uid-${ nextUid++ }`;
      el.dataset.uid = uid;
      if (el.classList.contains("indent-1")) {
        //el.classList.add(lastParent);
        el.dataset.pid = lastParent;
      } else {
        //lastParent = `parent-${ nextPid++ }`;
        //el.dataset.pid = lastParent;
        lastParent = uid;
      }
    });
  }

  document.querySelectorAll(".entry.init-hide").forEach((el) => {
    el.classList.add("hide");
  });

  const search = document.getElementById("search");
  search.oninput = function() {
      updateVisible(search.value);
  };

  updateVisible("");


  search.focus();

})();
