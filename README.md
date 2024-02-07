# Cloud Resizer App

The Cloud Resizer app is designed to provide a streamlined and efficient solution for resizing and manipulating images in a cloud-based environment. Its primary purpose is to address the growing demand for image resizing and optimization, often encountered in web development, content management systems, and various digital applications. What sets this app apart is its ability to dynamically resize and serve images from cloud storage (Amazon S3) or cache (Redis) while maintaining optimal user experience and performance. By incorporating cloud infrastructure, it offers scalability and reliability, ensuring that images can be resized on-demand and quickly delivered to users. The remarkable aspect of the app lies in its ability to seamlessly switch between local, cloud, and cached image sources, ensuring that users consistently receive resized images without latency.

## Services Used

### Redis

Redis is a versatile, open-source, in-memory data store that plays a pivotal role in the Cloud Resizer application. Redis is primarily used for caching resized images, ensuring swift retrieval and reduced load times. It provides a key-value data store that allows us to store and retrieve images efficiently. The application utilizes Redis to store URLs and base64-encoded content of resized images temporarily. When users request an image that has been resized before, the application first checks the Redis cache. If the image is found, it is returned instantly, minimizing the processing load on the server. By employing Redis, the application enhances its performance and responsiveness by serving images from cache. It also contributes to the persistence and scaling of the application, making it ideal for a dynamic environment where users frequently request the same images.

### Amazon S3

Amazon Simple Storage Service (Amazon S3) is a scalable and secure object storage service provided by Amazon Web Services (AWS). In our application, Amazon S3 serves as the primary storage solution for various image-related tasks. Users' high-resolution images are stored in Amazon S3 buckets. When images need to be retrieved, resized, or served, they are fetched from or stored in S3 buckets. Amazon S3 is essential for both the persistence and scalability of the application. It ensures durability and availability of uploaded images while allowing for smooth, high-throughput access. Additionally, it contributes to the overall architecture's fault tolerance and robustness, which is crucial for an application that relies on quick and reliable image processing and delivery.

## Use Cases

### Single Resize

**As a user**  
**I want to upload high-resolution images**  
**So that I can resize the image to my specification**

In this use case, a user uploads a high-resolution image, and the application resizes it to specific dimensions for creating a website thumbnail. This feature is crucial for users who need to optimize image sizes for web pages, ensuring faster loading times and better user experience. To implement this service, we rely on a combination of AWS services like Amazon S3 for storing uploaded images, AWS Lambda for on-demand image resizing, and Redis for caching the resized images. The resizing process is handled asynchronously, ensuring quick response times and efficient resource utilization.

### Batch Resize

**As a user**  
**I want to upload multiple images at once**  
**So that they can all be resized at once**

In this use case, a photographer or content creator uploads multiple images from a photoshoot or project and requests them to be resized to a standard resolution for online portfolio display. Batch resizing streamlines the workflow, saves time, and ensures consistent image quality across the portfolio. The resized images are stored in Amazon S3, and the resized images are cached in Redis to further accelerate delivery. The use of serverless functions and caching enhances the application's scalability and responsiveness.

These use cases demonstrate how the application accommodates both single and batch resizing, providing users with a flexible and efficient solution for managing their image content. The combination of AWS services ensures scalability, resilience, and rapid image processing for a seamless user experience.

## Technical Breakdown

### Architecture

The Cloud Resizer application employs a client-server architecture. It is designed to allow users to upload high-resolution images for resizing and then serve the resized images on demand. The architecture can be divided into several key components:

1. **Client:** Users interact with the application through a web interface. They upload images, specify resizing options, and view/download the resized images.
2. **Server:** The server, hosted on a cloud-based infrastructure, is responsible for receiving and processing user requests. It utilizes Express.js, a Node.js web application framework, to handle incoming HTTP requests. The server manages the image resizing process, communicates with external services, and caches images for performance optimization.
3. **Redis:** Redis serves as an in-memory data store for caching images temporarily. When users request resized images, the server checks Redis first to see if the requested image is already cached. This minimizes the processing load on the server and enhances performance.
4. **Amazon S3:** Amazon S3 provides scalable and secure object storage for the application. Users' high-resolution images are stored in Amazon S3 buckets. When images need to be retrieved, resized, or served, they are fetched from or stored in S3 buckets.
5. **External Libraries:** The application leverages several external libraries and services, including Sharp for image resizing, Multer for file upload handling, and Express.js for routing and serving web pages.

To ensure optimal performance and responsiveness, our application incorporates a robust scalability strategy backed by a load balancer. The load balancer is intelligently configured to trigger scaling operations when the CPU utilization reaches 50%. This well-thought-out threshold ensures that as our user base grows and the application encounters increased traffic, additional server instances are dynamically added to distribute the load efficiently. The load balancer also enforces an upper limit, allowing a maximum of 5 instances to be active concurrently. This approach strikes a balance between resource utilization and cost-effectiveness, preventing over-provisioning while maintaining smooth operation under varying workloads. As a result, our architecture seamlessly handles fluctuations in traffic, ensuring that users experience consistently fast response times and uninterrupted service, making it well-prepared for the demands of a growing global user base.

### Implementation Details

In the implementation of the image uploading and resizing feature, the utilization of MAC addresses plays a crucial role in enhancing user experience and optimizing resource management. When a user uploads a high-resolution image for resizing, we take advantage of this unique identification method to efficiently manage their previously uploaded images. By incorporating the MAC address, we create a distinct cache key, allowing us to retrieve previously resized images from both Redis and Amazon S3.

This approach ensures that users can access their previously processed images quickly without the need for redundant resizing operations. The combination of Redis caching and S3 storage guarantees that users can enjoy a seamless experience, benefiting from reduced latency and enhanced application responsiveness. When users request an image that has been processed before, the application can directly retrieve it from the Redis cache or S3 storage, eliminating the need for repetitive resizing tasks and conserving valuable computing resources.

## Client / Server Demarcation of Responsibilities

The client and server have distinct roles within the application. The client interface allows users to interact with the application, uploading high-resolution images and specifying resizing options. It also displays the resized images and provides the option to download them. The client is responsible for presenting the user interface and handling user interactions.

On the other hand, the server is responsible for handling the logic behind image resizing and caching. When an image is uploaded, the server processes it using Sharp to resize it based on user
