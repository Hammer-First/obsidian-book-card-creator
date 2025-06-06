# Obsidian Book Card Creator

Obsidian Book Card Creatorは、AmazonのURL から本の情報を取得したり、技術ブログのURLから記事の情報を取得し、カスタマイズ可能なテンプレートを使用してObsidianノートを作成するプラグインです。

## 機能

- AmazonのURLから本の情報（タイトル、著者、ジャンル、概要）を取得
- 技術ブログのURLからタイトルと内容を取得し、AnthropicのAPI（Claude）を使って要約を生成
- カスタマイズ可能なテンプレートを使用してノートを作成
- テンプレートファイルと出力フォルダを指定可能
- テンプレート内で変数を使用して情報を挿入

## インストール

1. Obsidianの設定を開く
2. サードパーティプラグイン > コミュニティプラグイン > 参照
3. "Book Card Creator" で検索
4. インストールをクリック
5. プラグインを有効化

または、このリポジトリをクローンして、`.obsidian/plugins/book-card-creator` ディレクトリに配置することもできます。

## 使い方

### 初期設定

1. 設定メニューからBook Card Creator設定を開く
2. テンプレートファイル: ノート作成に使用するテンプレートファイルを選択
3. 出力フォルダ: 作成したノートを保存するフォルダを選択
4. Anthropic API Key: 技術ブログの要約に使用するAnthropicのAPIキーを入力（オプション）

### 書籍ノートの作成

1. コマンドパレットを開く（Ctrl+P または Cmd+P）
2. "Create Book Card from Amazon URL" を選択
3. AmazonのURL を入力して「Create」をクリック
4. 情報が取得され、テンプレートに基づいて新しいノートが作成されます

### 技術ブログノートの作成

1. コマンドパレットを開く（Ctrl+P または Cmd+P）
2. "Create Tech Blog Card from URL" を選択
3. 技術ブログのURL を入力して「Create」をクリック
4. 情報が取得され、テンプレートに基づいて新しいノートが作成されます
5. Anthropic APIキーが設定されている場合、ブログ記事の内容がLLMによって要約されます

### テンプレートの変数

テンプレートでは以下の変数を使用できます:

#### 書籍カード用変数
- `{{book-creator:title}}` - 本のタイトル
- `{{book-creator:author}}` - 著者
- `{{book-creator:genre}}` - ジャンル
- `{{book-creator:summary}}` - 概要
- `{{book-creator:amazon-link}}` - Amazonページへのリンク（Markdown形式）

#### ブログカード用変数
- `{{blog-creator:title}}` - ブログのタイトル
- `{{blog-creator:summary}}` - LLMによる要約
- `{{blog-creator:blog-link}}` - ブログページへのリンク（Markdown形式）

## サンプルテンプレート

```markdown
# {{book-creator:title}}

## 基本情報
- **著者**: {{book-creator:author}}
- **ジャンル**: {{book-creator:genre}}

## 概要
{{book-creator:summary}}

## メモ
<!-- あなたの読書メモをここに記入してください -->

## 引用
<!-- 印象に残った引用をここに記入してください -->

## 評価
<!-- 本の評価をここに記入してください (例: ★★★★☆) -->
```

## 注意事項

このプラグインはAmazonのウェブサイトからデータを取得します。Amazon APIではなくウェブページからのデータ取得のため、Amazon側の仕様変更によって正常に動作しなくなる可能性があります。その場合は、更新されたバージョンをお待ちください。

プラグインの使用にはインターネット接続が必要です。また、CORSの問題を回避するためにサードパーティのプロキシサービスを使用しています。

## 今後の機能

- Amazon Web Services Product Advertising API への対応
- 表紙画像の取得と埋め込み
- 複数の書店URLのサポート
- より高度なメタデータの取得（ページ数、出版日、ISBN等）
- 技術ブログの抽出アルゴリズムの改善
- 複数のLLMプロバイダーのサポート

## ライセンス

MIT