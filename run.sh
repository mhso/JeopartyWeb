pushd $(dirname $0)

# Build the frontend and export the result to ./dist, where Flask serves it from
rm -rf dist
podman build . --output type=local,dest=dist || exit 1
podman image prune -f

popd
