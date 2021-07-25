Flatworm Docs
=============

Fragments
---------

### Directive Format

```

```

### Flatworm Directives

#### **_section:** *TITLE*

A *section* has its **TITLE** in an H1 font. Sections are linked to in *Table of Contents* and have a dividing line drawn above them. If an option is specified, it is avaialble as a name for intern linking. There should only be one `_section:` per page.


#### **_subsection:** *TITLE*

A *subsection* has its **TITLE** in an H2 font. Subsections are linked to in *Table of Contents* and have a dividing line drawn above them. If an option is specified, it is avaialble as a name for internal linking.


#### **_heading:** *TITLE*

A *heading* has its **TITLE** in an H3 font. If an option is specified, it is available as a name for internal linking.


#### **_definition:** *TERM*

A *definition* has its **TERM** bolded and the markdown body is indented.


#### **_property:** *SIGNATURE*

A *property* has its JavaScript **SIGNATURE** formatted and the markdown body is indented.


#### **_code:** *FILENAME*

A *code* reads the **FILENAME** and depending on the extension adjusts it.

For JavaScript files, the file is executed, with `//!` replaced with the result of the last statement and `//!error` is replaced with the throw error. If the error state does not agree, rendering fails.


#### **_toc:**

A *toc* injects a Table of Contents, loading each line of the body as a filename and recursively loads the *toc* if present, otherwise all the *sections* and *subsections*.


#### **_null:**

A *null* is used to terminated a directive. For example, after a *definition*, the bodies are indented, so a *null* can be used to reset the indentation.


### Examples

```

```

Markdown
--------

```

```

