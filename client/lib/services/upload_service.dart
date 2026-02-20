import "dart:typed_data";

import "package:arcnem_vision_client/services/auth_service.dart";
import "package:arcnem_vision_client/services/http_response_utils.dart";
import "package:fpdart/fpdart.dart";
import "package:http/http.dart" as http;

class UploadService {
  final AuthService _authService = AuthService();

  TaskEither<String, Map<String, dynamic>> _expectSuccessJson(
    http.Response response, {
    required String action,
  }) {
    if (response.statusCode != 200) {
      return TaskEither.left(
        extractErrorMessageFromResponse(
          response,
          fallbackMessage: "$action failed with status ${response.statusCode}",
        ),
      );
    }

    return TaskEither.fromEither(
      decodeJsonObject(
        response.body,
        emptyBodyMessage: "$action failed: response body was empty",
        invalidJsonMessage: "$action failed: response body was not valid JSON",
      ),
    );
  }

  TaskEither<String, Map<String, dynamic>> presign({
    required String contentType,
    required int size,
  }) {
    return _authService
        .makeAuthenticatedRequest(
          method: "POST",
          endpoint: "/api/uploads/presign",
          body: {"contentType": contentType, "size": size},
        )
        .flatMap(
          (response) => _expectSuccessJson(response, action: "Presign request"),
        );
  }

  TaskEither<String, Unit> uploadToPresignedUrl({
    required String uploadUrl,
    required Uint8List bytes,
    required String contentType,
  }) {
    return TaskEither.tryCatch(
      () async => await http.put(
        Uri.parse(uploadUrl),
        headers: {"Content-Type": contentType},
        body: bytes,
      ),
      (error, _) => "Upload to S3 failed | error: $error",
    ).flatMap((response) {
      if (response.statusCode == 200 || response.statusCode == 201) {
        return TaskEither.of(unit);
      }
      return TaskEither.left(
        "S3 upload failed with status ${response.statusCode}",
      );
    });
  }

  TaskEither<String, Map<String, dynamic>> ackUpload({
    required String objectKey,
  }) {
    return _authService
        .makeAuthenticatedRequest(
          method: "POST",
          endpoint: "/api/uploads/ack",
          body: {"objectKey": objectKey},
        )
        .flatMap(
          (response) => _expectSuccessJson(response, action: "Ack request"),
        );
  }

  /// Runs the full upload workflow: presign → PUT to S3 → ack.
  /// Returns the ack response containing documentId.
  TaskEither<String, Map<String, dynamic>> uploadImage({
    required Uint8List bytes,
    required String contentType,
  }) {
    return presign(contentType: contentType, size: bytes.length).flatMap((
      presignData,
    ) {
      final uploadUrl = presignData["uploadUrl"] as String;
      final objectKey = presignData["objectKey"] as String;

      return uploadToPresignedUrl(
        uploadUrl: uploadUrl,
        bytes: bytes,
        contentType: contentType,
      ).flatMap((_) => ackUpload(objectKey: objectKey));
    });
  }
}
