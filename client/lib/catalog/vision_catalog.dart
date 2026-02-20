import 'package:genui/genui.dart';

import 'package:arcnem_vision_client/catalog/document_card_item.dart';
import 'package:arcnem_vision_client/catalog/document_gallery_item.dart';
import 'package:arcnem_vision_client/catalog/text_message_item.dart';

Catalog createVisionCatalog() {
  return CoreCatalogItems.asCatalog().copyWith([
    documentCardItem,
    documentGalleryItem,
    textMessageItem,
  ], catalogId: 'com.arcnem.vision');
}
