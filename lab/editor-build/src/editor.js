import ClassicEditorBase from '@ckeditor/ckeditor5-editor-classic/src/classiceditor';

// Core essentials
import Essentials from '@ckeditor/ckeditor5-essentials/src/essentials';
import Paragraph from '@ckeditor/ckeditor5-paragraph/src/paragraph';
import Heading from '@ckeditor/ckeditor5-heading/src/heading';
import Bold from '@ckeditor/ckeditor5-basic-styles/src/bold';
import Italic from '@ckeditor/ckeditor5-basic-styles/src/italic';
import Underline from '@ckeditor/ckeditor5-basic-styles/src/underline';
import Strikethrough from '@ckeditor/ckeditor5-basic-styles/src/strikethrough';
import Link from '@ckeditor/ckeditor5-link/src/link';
import List from '@ckeditor/ckeditor5-list/src/list';
import Alignment from '@ckeditor/ckeditor5-alignment/src/alignment';
import BlockQuote from '@ckeditor/ckeditor5-block-quote/src/blockquote';
import CodeBlock from '@ckeditor/ckeditor5-code-block/src/codeblock';
import Table from '@ckeditor/ckeditor5-table/src/table';
import TableToolbar from '@ckeditor/ckeditor5-table/src/tabletoolbar';
import HorizontalLine from '@ckeditor/ckeditor5-horizontal-line/src/horizontalline';
import RemoveFormat from '@ckeditor/ckeditor5-remove-format/src/removeformat';

class ClassicEditor extends ClassicEditorBase {}

ClassicEditor.builtinPlugins = [
  Essentials,
  Paragraph,
  Heading,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Link,
  List,
  Alignment,
  BlockQuote,
  CodeBlock,
  Table,
  TableToolbar,
  HorizontalLine,
  RemoveFormat
];

ClassicEditor.defaultConfig = {
  toolbar: { items: [] }, // Hidden in UI; custom ribbon is injected by dock script
  language: 'en'
};

export default ClassicEditor;
