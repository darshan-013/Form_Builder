package com.formbuilder.controller;

import com.formbuilder.constants.AppConstants;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.net.MalformedURLException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Controller for downloading uploaded files from submissions.
 * Files are stored in the uploads directory and served with proper MIME types.
 */
@Slf4j
@RestController
@RequestMapping(AppConstants.API_FILES)
@CrossOrigin(origins = "http://localhost:3000", allowCredentials = "true")
public class FileDownloadController {

    // Check both possible upload directories
    private static final String[] UPLOAD_DIRS = {"uploads", "backend/uploads", "../uploads"};

    /**
     * Download a file by filename.
     *
     * @param filename The name of the file to download
     * @return ResponseEntity with file content and proper headers
     */
    @GetMapping("/download/{filename:.+}")
    public ResponseEntity<Resource> downloadFile(@PathVariable String filename) {
        try {
            // Try to find file in multiple possible locations
            Path filePath = findFile(filename);

            if (filePath == null) {
                log.error("File not found in any upload directory: {}", filename);
                return ResponseEntity.notFound().build();
            }

            Resource resource = new UrlResource(filePath.toUri());

            // Check if file exists
            if (!resource.exists() || !resource.isReadable()) {
                log.error("File not readable: {}", filename);
                return ResponseEntity.notFound().build();
            }

            // Detect content type
            String contentType = detectContentType(filePath);

            // Get original filename (without UUID prefix if present)
            String displayName = getDisplayFilename(filename);

            log.info("Downloading file: {} (type: {})", filename, contentType);

            // Return file with proper headers
            return ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType(contentType))
                    .header(HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename=\"" + displayName + "\"")
                    .body(resource);

        } catch (MalformedURLException e) {
            log.error("Invalid file path: {}", filename, e);
            return ResponseEntity.badRequest().build();
        }
    }

    /**
     * View a file inline (for images, PDFs, etc.)
     *
     * @param filename The name of the file to view
     * @return ResponseEntity with file content and inline disposition
     */
    @GetMapping("/view/{filename:.+}")
    public ResponseEntity<Resource> viewFile(@PathVariable String filename) {
        try {
            // Try to find file in multiple possible locations
            Path filePath = findFile(filename);

            if (filePath == null) {
                log.error("File not found in any upload directory: {}", filename);
                return ResponseEntity.notFound().build();
            }

            Resource resource = new UrlResource(filePath.toUri());

            if (!resource.exists() || !resource.isReadable()) {
                log.error("File not readable: {}", filename);
                return ResponseEntity.notFound().build();
            }

            String contentType = detectContentType(filePath);

            log.info("Viewing file: {} (type: {})", filename, contentType);

            // Return file with inline disposition (opens in browser)
            return ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType(contentType))
                    .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + filename + "\"")
                    .body(resource);

        } catch (MalformedURLException e) {
            log.error("Invalid file path: {}", filename, e);
            return ResponseEntity.badRequest().build();
        }
    }

    /**
     * Detect the content type of a file.
     */
    private String detectContentType(Path filePath) {
        try {
            String contentType = Files.probeContentType(filePath);
            if (contentType == null) {
                // Fallback to extension-based detection
                String filename = filePath.getFileName().toString().toLowerCase();
                if (filename.endsWith(".pdf")) return "application/pdf";
                if (filename.endsWith(".png")) return "image/png";
                if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) return "image/jpeg";
                if (filename.endsWith(".gif")) return "image/gif";
                if (filename.endsWith(".txt")) return "text/plain";
                if (filename.endsWith(".csv")) return "text/csv";
                if (filename.endsWith(".doc")) return "application/msword";
                if (filename.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
                if (filename.endsWith(".xls")) return "application/vnd.ms-excel";
                if (filename.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

                // Default to octet-stream
                return "application/octet-stream";
            }
            return contentType;
        } catch (IOException e) {
            log.warn("Could not detect content type for {}, using default", filePath.getFileName());
            return "application/octet-stream";
        }
    }

    /**
     * Extract display filename from stored filename.
     * If filename has UUID prefix (e.g., "uuid_originalname.ext"), return original name.
     * Otherwise, return as-is.
     */
    private String getDisplayFilename(String storedFilename) {
        // Check if filename starts with UUID pattern (36 chars + underscore)
        if (storedFilename.length() > 37 && storedFilename.charAt(36) == '_') {
            return storedFilename.substring(37);
        }
        return storedFilename;
    }

    /**
     * Find file in multiple possible upload directories.
     * Checks: uploads/, backend/uploads/, ../uploads/
     *
     * @param filename The filename to search for
     * @return Path to the file if found, null otherwise
     */
    private Path findFile(String filename) {
        for (String dir : UPLOAD_DIRS) {
            try {
                Path path = Paths.get(dir).resolve(filename).normalize();
                if (Files.exists(path) && Files.isReadable(path)) {
                    log.debug("File found in directory: {}", dir);
                    return path;
                }
            } catch (Exception e) {
                log.trace("Could not check directory {}: {}", dir, e.getMessage());
            }
        }
        return null;
    }
}




