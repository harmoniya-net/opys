FROM node:22-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends \
      xvfb x11-utils x11-xserver-utils imagemagick unzip procps \
      libgl1-mesa-dri libglx-mesa0 libgl1 libegl1 libgles2 mesa-utils \
      libxrandr2 libxcursor1 libxxf86vm1 libxi6 libxtst6 libxrender1 libxinerama1 libxext6 libx11-xcb1 \
      libopenal1 libasound2 libpulse0 libfreetype6 libfontconfig1 \
      build-essential pkg-config ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
ENV RUSTUP_HOME=/opt/rustup CARGO_HOME=/opt/cargo PATH=/opt/cargo/bin:$PATH
RUN curl -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable
WORKDIR /work
